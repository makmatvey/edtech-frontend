import { SHORT_QUESTIONS, normalizeShort, type QB } from "../data/questions-short.js";
import { SENIOR_QUESTIONS, SENIOR_SHORT } from "../data/questions-senior.js";
import { all, get, run, tx } from "../db.js";
import { addDays, today } from "../calendar.js";
import { PASS_RATIO } from "./streak.js";
import { HttpError } from "../http.js";

export const DAILY_SIZE = 5;
export const HOMEWORK_SIZE = 3;
export const FLIPPED_SIZE = 3;
export const EXAM_SIZE = 10;
/** Вариант как на ЦТ/ЦЭ: сначала часть А (выбор ответа), затем часть В (краткий ответ) */
export const EXAM_PART_B = 3;
const MAX_PER_SUBJECT = 2;

export type QuizMode = "daily" | "homework" | "flipped" | "exam";

/** Тренировочные варианты в формате ЦТ/ЦЭ (часть А + часть В) по темам программы — не задания прошлых лет РИКЗ. */
export type ExamVariant = { id: string; no: number; title: string };
export const EXAM_VARIANTS: ExamVariant[] = [1, 2, 3, 4, 5, 6, 7, 8].map((no) => ({ id: `v${no}`, no, title: `Вариант ${no}` }));
export function examVariant(id: string) {
  return EXAM_VARIANTS.find((v) => v.id === id) ?? null;
}

function hashSeed(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function seededRand(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Coverage = { subjectId: number; maxSection: number; currentSection: number; lastLesson: string };

/**
 * Что класс уже прошёл к дате `at`: по каждому предмету — максимальный номер раздела
 * программы среди проведённых уроков (дата ≤ at) и текущий раздел.
 * Вопросы берутся ТОЛЬКО из своего класса и из пройденных разделов.
 */
export function coverage(classId: number, at: string): Map<number, Coverage> {
  const rows = all(
    `SELECT ta.subject_id, MAX(ct.section_no) AS max_section, MAX(l.date) AS last_lesson
       FROM lessons l
       JOIN teacher_assignments ta ON ta.id = l.assignment_id
       JOIN curriculum_topics ct ON ct.id = l.topic_id
      WHERE ta.class_id = ? AND l.date <= ?
      GROUP BY ta.subject_id`,
    classId, at,
  );
  const map = new Map<number, Coverage>();
  for (const r of rows) {
    const cur = get(
      `SELECT ct.section_no FROM lessons l
         JOIN teacher_assignments ta ON ta.id = l.assignment_id
         JOIN curriculum_topics ct ON ct.id = l.topic_id
        WHERE ta.class_id = ? AND ta.subject_id = ? AND l.date <= ?
        ORDER BY l.date DESC, l.lesson_no DESC LIMIT 1`,
      classId, r.subject_id, at,
    );
    map.set(r.subject_id, {
      subjectId: r.subject_id,
      maxSection: r.max_section,
      currentSection: cur?.section_no ?? r.max_section,
      lastLesson: r.last_lesson,
    });
  }
  return map;
}

export function studentClass(studentId: number) {
  const c = get(
    `SELECT c.id, c.name, c.grade FROM class_students cs JOIN classes c ON c.id = cs.class_id WHERE cs.student_id = ?`,
    studentId,
  );
  if (!c) throw new HttpError(404, "Ученик не привязан к классу");
  return c as { id: number; name: string; grade: number };
}

/**
 * Банк вопросов заполнен для 5, 7, 9 и 11 классов.
 * Для 6/8 берём ближайший младший банк; для ЦТ/ЦЭ (10–11) — банк 11 класса.
 * Так квиз дня, самопроверка и тренировка не падают на «пустых» параллелях.
 */
export function quizBankGrade(classGrade: number): number {
  if (classGrade >= 10) return 11;
  if (classGrade === 8) return 7;
  if (classGrade === 6) return 5;
  return classGrade;
}

/** JSON-массив из базы; повреждённое значение → null (вызывающий решает, пропустить ли запись). */
export function parseJsonArray(s: unknown): unknown[] | null {
  if (typeof s !== "string") return null;
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}
const parseIds = (s: unknown) => parseJsonArray(s)?.filter((x): x is number => Number.isInteger(x)) ?? null;

function weightedPick<T>(items: { item: T; w: number; key: number }[], n: number, perKeyLimit: number, rand: () => number = Math.random): T[] {
  const pool = [...items];
  const out: T[] = [];
  const perKey = new Map<number, number>();
  while (out.length < n && pool.length) {
    const eligible = pool.filter((p) => (perKey.get(p.key) ?? 0) < perKeyLimit);
    const src = eligible.length ? eligible : pool;
    const total = src.reduce((s, p) => s + p.w, 0);
    let r = rand() * total;
    let chosen = src[src.length - 1];
    for (const p of src) {
      r -= p.w;
      if (r <= 0) { chosen = p; break; }
    }
    out.push(chosen.item);
    perKey.set(chosen.key, (perKey.get(chosen.key) ?? 0) + 1);
    pool.splice(pool.indexOf(chosen), 1);
  }
  return out;
}

/**
 * Вопросы последних 10 дней. Незавершённый квиз дня за `at` не учитываем: иначе подбор зависел бы
 * от того, успел ли параллельный запрос создать попытку, и два запроса получили бы разные вопросы.
 */
function recentlySeen(studentId: number, at: string): Set<number> {
  const rows = all(
    `SELECT question_ids FROM quiz_attempts WHERE student_id = ? AND date >= ? AND date <= ?
       AND NOT (mode = 'daily' AND date = ? AND submitted_at IS NULL)`,
    studentId, addDays(at, -10), at, at,
  );
  return new Set(rows.flatMap((r) => parseIds(r.question_ids) ?? []));
}

/** Номер следующей попытки квиза дня: 1 + число уже отправленных за этот день (пересдача → другой номер → другие вопросы). */
export function dailyAttemptNo(studentId: number, at = today()) {
  return 1 + Number(get(
    "SELECT COUNT(*) AS n FROM quiz_attempts WHERE student_id = ? AND date = ? AND mode = 'daily' AND submitted_at IS NOT NULL",
    studentId, at,
  )?.n ?? 0);
}

/**
 * Подбор вопросов «Квиза дня». Ученик 7 класса получает вопросы только 7 класса и только по пройденному.
 * Детерминирован: один и тот же ученик, дата и номер попытки → один и тот же набор вопросов.
 */
export function pickDaily(studentId: number, at = today(), size = DAILY_SIZE, attemptNo = dailyAttemptNo(studentId, at)): number[] {
  const cls = studentClass(studentId);
  const cov = coverage(cls.id, at);
  if (!cov.size) return [];
  const rand = seededRand(hashSeed(`daily:${studentId}:${at}:${attemptNo}`));
  const seen = recentlySeen(studentId, at);
  const yesterday = addDays(at, -3); // «недавние» уроки — последние 3 дня (включая выходные)
  const qs = all("SELECT id, subject_id, section_no FROM quiz_questions WHERE grade = ? AND answer IS NULL", quizBankGrade(cls.grade));
  const items = qs
    .filter((q) => {
      const c = cov.get(q.subject_id);
      return c && q.section_no <= c.maxSection;
    })
    .map((q) => {
      const c = cov.get(q.subject_id)!;
      let w = 1;
      if (q.section_no === c.currentSection) w *= 3; // свежая тема важнее
      if (c.lastLesson >= yesterday) w *= 2; // предмет был недавно
      if (seen.has(q.id)) w *= 0.15; // не повторяем одно и то же
      return { item: q.id as number, w, key: q.subject_id as number };
    });
  return weightedPick(items, size, MAX_PER_SUBJECT, rand);
}

const openDaily = (studentId: number, at: string) => get(
  "SELECT id, question_ids FROM quiz_attempts WHERE student_id = ? AND date = ? AND mode = 'daily' AND submitted_at IS NULL ORDER BY id LIMIT 1",
  studentId, at,
);

/**
 * Начать «Квиз дня» или продолжить незавершённый. Одна транзакция, а вставка — «только если нет открытой попытки»,
 * поэтому параллельные запросы получают одну и ту же попытку. После отправленной попытки (в т.ч. неудачной)
 * создаётся новая — с другим номером и другими вопросами.
 */
export function startDailyQuiz(studentId: number, at = today(), size = DAILY_SIZE): { attemptId: number; ids: number[]; resumed: boolean } {
  return tx(() => {
    const open = openDaily(studentId, at);
    if (open) {
      const ids = parseIds(open.question_ids);
      if (ids?.length) return { attemptId: open.id as number, ids, resumed: true };
      run("DELETE FROM quiz_attempts WHERE id = ?", open.id); // повреждённая незавершённая попытка — подбираем заново
    }
    const ids = pickDaily(studentId, at, size);
    if (ids.length < 3) throw new HttpError(404, "Пока недостаточно пройденных тем для квиза");
    const attemptId = createAttempt(studentId, "daily", ids, null, at);
    // createAttempt мог вернуть чужую открытую попытку (другой процесс успел раньше) — отдаём её вопросы
    const stored = parseIds(get("SELECT question_ids FROM quiz_attempts WHERE id = ?", attemptId)?.question_ids);
    return { attemptId, ids: stored?.length ? stored : ids, resumed: false };
  });
}

/** Вопросы для самопроверки ДЗ: тот же предмет и класс, раздел урока в приоритете. */
export function pickHomework(lessonId: number, size = HOMEWORK_SIZE): number[] {
  const l = get(
    `SELECT ta.subject_id, c.grade, ct.section_no FROM lessons l
       JOIN teacher_assignments ta ON ta.id = l.assignment_id
       JOIN classes c ON c.id = ta.class_id
       LEFT JOIN curriculum_topics ct ON ct.id = l.topic_id
      WHERE l.id = ?`,
    lessonId,
  );
  if (!l || l.section_no == null) return [];
  const bank = quizBankGrade(l.grade);
  const qs = all(
    "SELECT id, section_no FROM quiz_questions WHERE subject_id = ? AND grade = ? AND section_no <= ? AND answer IS NULL",
    l.subject_id, bank, l.section_no,
  );
  const items = qs.map((q) => ({ item: q.id as number, w: q.section_no === l.section_no ? 4 : 1, key: 0 }));
  return weightedPick(items, size, size);
}

/**
 * Превью к перевёрнутому уроку: вопросы именно по разделу завтрашней темы
 * (даже если класс её ещё не прошёл) — чтобы прийти готовым к обсуждению.
 */
export function pickFlipped(lessonId: number, size = FLIPPED_SIZE): number[] {
  const l = get(
    `SELECT ta.subject_id, c.grade, ct.section_no FROM lessons l
       JOIN teacher_assignments ta ON ta.id = l.assignment_id
       JOIN classes c ON c.id = ta.class_id
       LEFT JOIN curriculum_topics ct ON ct.id = l.topic_id
      WHERE l.id = ?`,
    lessonId,
  );
  if (!l || l.section_no == null) return [];
  const bank = quizBankGrade(l.grade);
  const qs = all(
    "SELECT id, section_no FROM quiz_questions WHERE subject_id = ? AND grade = ? AND section_no = ? AND answer IS NULL",
    l.subject_id, bank, l.section_no,
  );
  if (qs.length >= size) {
    return weightedPick(qs.map((q) => ({ item: q.id as number, w: 1, key: 0 })), size, size);
  }
  // Если в разделе мало вопросов — добираем соседними из того же предмета
  const more = all(
    "SELECT id, section_no FROM quiz_questions WHERE subject_id = ? AND grade = ? AND section_no BETWEEN ? AND ? AND answer IS NULL",
    l.subject_id, bank, Math.max(1, l.section_no - 1), l.section_no + 1,
  );
  const items = more.map((q) => ({ item: q.id as number, w: q.section_no === l.section_no ? 4 : 1, key: 0 }));
  return weightedPick(items, size, size);
}

/**
 * Тренировка к ЦТ/ЦЭ: вопросы по пройденным разделам предмета.
 * variantId задаёт «год / вариант» — один и тот же id даёт один и тот же набор вопросов
 * для предмета и класса (удобно сравнивать результаты и выбирать разные годы).
 */
export function pickExam(studentId: number, subjectId: number, variantId: string, at = today(), size = EXAM_SIZE): number[] {
  const cls = studentClass(studentId);
  const cov = coverage(cls.id, at).get(subjectId);
  // Банк ЦТ/ЦЭ размечен как 11 класс; 10 класс тренируется по тому же банку.
  // Разделы программ 10 и 11 не совпадают — для 10 класса берём банк без отсечки по section_no.
  const bank = quizBankGrade(cls.grade);
  const remap = bank !== cls.grade;
  if (!cov && !remap) return [];
  const pool = (short: boolean) => {
    const shortClause = short ? "NOT NULL" : "NULL";
    const rows = !remap && cov
      ? all(
        `SELECT id FROM quiz_questions WHERE subject_id = ? AND grade = ? AND section_no <= ? AND answer IS ${shortClause} ORDER BY id`,
        subjectId, bank, cov.maxSection,
      )
      : all(
        `SELECT id FROM quiz_questions WHERE subject_id = ? AND grade = ? AND answer IS ${shortClause} ORDER BY id`,
        subjectId, bank,
      );
    return rows.map((q) => q.id as number);
  };
  const rand = seededRand(hashSeed(`${variantId}:${subjectId}:${cls.grade}`));
  const shuffle = (xs: number[]) => {
    for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]]; }
    return xs;
  };
  const b = shuffle(pool(true)).slice(0, EXAM_PART_B);
  const a = shuffle(pool(false)).slice(0, size - b.length);
  return [...a, ...b];
}

/** Верен ли ответ: индекс варианта (часть А) или текст (часть В) */
export function isRight(q: { correct?: unknown; answer?: unknown }, given: unknown) {
  if (q.answer) {
    if (typeof given !== "string") return false;
    const ok = (parseJsonArray(String(q.answer)) ?? []).filter((x): x is string => typeof x === "string").map(normalizeShort);
    return ok.includes(normalizeShort(given));
  }
  return given === q.correct;
}

export function publicQuestions(ids: number[]) {
  if (!ids.length) return [];
  const rows = all(
    `SELECT q.id, q.question, q.options, q.answer, s.name AS subject, s.color, s.code
       FROM quiz_questions q JOIN subjects s ON s.id = q.subject_id
      WHERE q.id IN (${ids.map(() => "?").join(",")})`,
    ...ids,
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => {
    const r = byId.get(id)!;
    return {
      id: r.id, question: r.question, kind: (r.answer ? "short" : "choice") as "short" | "choice",
      options: r.answer ? [] : (parseJsonArray(r.options) ?? []) as string[], subject: r.subject, subjectCode: r.code, color: r.color,
    };
  });
}

export function createAttempt(studentId: number, mode: QuizMode, ids: number[], lessonId: number | null, at = today(), variant: string | null = null) {
  if (mode === "daily") {
    // Не больше одной незавершённой попытки квиза дня: вставка атомарна (INSERT … WHERE NOT EXISTS),
    // при гонке возвращается уже открытая попытка вместо второй
    const res = run(
      `INSERT INTO quiz_attempts (student_id, mode, lesson_id, date, question_ids, total, variant)
       SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS (
         SELECT 1 FROM quiz_attempts WHERE student_id = ? AND date = ? AND mode = 'daily' AND submitted_at IS NULL)`,
      studentId, mode, lessonId, at, JSON.stringify(ids), ids.length, variant, studentId, at,
    );
    if (Number(res.changes) > 0) return Number(res.lastInsertRowid);
    return Number(openDaily(studentId, at)!.id);
  }
  const res = run(
    "INSERT INTO quiz_attempts (student_id, mode, lesson_id, date, question_ids, total, variant) VALUES (?,?,?,?,?,?,?)",
    studentId, mode, lessonId, at, JSON.stringify(ids), ids.length, variant,
  );
  return Number(res.lastInsertRowid);
}

export const xpFor = (mode: "daily" | "homework", correct: number) => (mode === "daily" ? 10 : 5) + correct * 2;

/** Проверка ответов на сервере и начисление стрика/XP. Повторное прохождение не даёт второй день. */
export function submitAttempt(studentId: number, attemptId: number, answers: (number | string)[], at = today()) {
  return tx(() => {
    const a = get("SELECT * FROM quiz_attempts WHERE id = ?", attemptId);
    if (!a || a.student_id !== studentId) throw new HttpError(404, "Попытка не найдена");
    if (a.submitted_at) throw new HttpError(409, "Ответы уже отправлены");
    if (a.date !== at) throw new HttpError(410, "Этот квиз был на другой день — начните новый");
    const ids = parseIds(a.question_ids);
    if (!ids?.length) throw new HttpError(410, "Попытка повреждена — начните квиз заново");
    if (answers.length !== ids.length) throw new HttpError(400, "Ответьте на все вопросы");

    const rows = all(
      `SELECT id, correct, explanation, options, answer FROM quiz_questions WHERE id IN (${ids.map(() => "?").join(",")})`,
      ...ids,
    );
    const byId = new Map(rows.map((r) => [r.id, r]));
    const review = ids.map((id, i) => {
      const q = byId.get(id);
      if (!q) throw new HttpError(410, "Вопрос квиза больше недоступен — начните квиз заново");
      const correctText = q.answer ? String(parseJsonArray(q.answer)?.[0] ?? "") || null : null;
      return { id, chosen: answers[i], correct: q.correct as number, correctText, isCorrect: isRight(q, answers[i]), explanation: q.explanation as string };
    });
    const score = review.filter((r) => r.isCorrect).length;
    const passed = score / ids.length >= PASS_RATIO;
    run(
      "UPDATE quiz_attempts SET answers = ?, score = ?, passed = ?, submitted_at = datetime('now') WHERE id = ?",
      JSON.stringify(answers), score, passed ? 1 : 0, attemptId,
    );

    const mode = a.mode as QuizMode;
    let xp = 0;
    let dayCounted = false;
    // Стрик и XP — только за квиз дня и самопроверку ДЗ
    if ((mode === "daily" || mode === "homework") && passed) {
      const earlierPassed = get(
        "SELECT COUNT(*) AS n FROM quiz_attempts WHERE student_id = ? AND date = ? AND mode = ? AND passed = 1 AND id <> ? AND (lesson_id IS ? )",
        studentId, at, mode, attemptId, a.lesson_id,
      );
      if (Number(earlierPassed?.n ?? 0) === 0) {
        xp = xpFor(mode, score);
        const existing = get("SELECT xp FROM streak_days WHERE student_id = ? AND date = ?", studentId, at);
        if (existing) run("UPDATE streak_days SET xp = xp + ? WHERE student_id = ? AND date = ?", xp, studentId, at);
        else {
          run("INSERT INTO streak_days (student_id, date, source, xp) VALUES (?,?,?,?)", studentId, at, mode, xp);
          dayCounted = true;
        }
      }
    }
    if (mode === "homework" && a.lesson_id) {
      run("INSERT OR IGNORE INTO homework_done (student_id, lesson_id) VALUES (?, ?)", studentId, a.lesson_id);
    }
    if (mode === "flipped" && a.lesson_id && passed) {
      run("INSERT OR IGNORE INTO flipped_prep (student_id, lesson_id) VALUES (?, ?)", studentId, a.lesson_id);
    }
    return { score, total: ids.length, passed, xp, dayCounted, review };
  });
}

/** Задания части В: в сиде и один раз в уже существующих базах */
export function insertShortQuestions(list: QB[] = SHORT_QUESTIONS) {
  const subj = new Map(all("SELECT id, code FROM subjects").map((r) => [r.code as string, r.id as number]));
  for (const [code, grade, section, question, answers, explanation] of list) {
    const sid = subj.get(code);
    if (!sid) continue;
    run("INSERT INTO quiz_questions (subject_id, grade, section_no, question, options, correct, explanation, answer) VALUES (?,?,?,?,?,?,?,?)",
      sid, grade, section, question, "[]", -1, explanation, JSON.stringify(answers));
  }
}
export function syncShortQuestions() {
  if (Number(get("SELECT COUNT(*) AS n FROM quiz_questions WHERE answer IS NOT NULL AND grade < 10")?.n ?? 0) > 0) return;
  insertShortQuestions();
}

/** Банк 11 класса (подготовка к ЦТ/ЦЭ): части А и В */
export function insertSeniorQuestions() {
  const subj = new Map(all("SELECT id, code FROM subjects").map((r) => [r.code as string, r.id as number]));
  for (const [code, grade, section, question, options, correct, explanation] of SENIOR_QUESTIONS) {
    const sid = subj.get(code);
    if (!sid) continue;
    run("INSERT INTO quiz_questions (subject_id, grade, section_no, question, options, correct, explanation) VALUES (?,?,?,?,?,?,?)",
      sid, grade, section, question, JSON.stringify(options), correct, explanation);
  }
  insertShortQuestions(SENIOR_SHORT);
}
export function syncSeniorQuestions() {
  if (Number(get("SELECT COUNT(*) AS n FROM quiz_questions WHERE grade >= 10")?.n ?? 0) > 0) return;
  insertSeniorQuestions();
}
