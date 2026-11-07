import { Router } from "express";
import { z } from "zod";
import { all, get, run } from "../db.js";
import { authenticate, me, requireRole } from "../auth.js";
import { HttpError, h, intParam, parse } from "../http.js";
import { QUARTERS, addDays, currentQuarter, isSchoolDay, mondayOf, today } from "../calendar.js";
import { LESSON_SELECT, avg, markNext, shapeLesson, textbookFor } from "../services/lessons.js";
import { streakBrief, streakState } from "../services/streak.js";
import {
  DAILY_SIZE, EXAM_PART_B, EXAM_SIZE, EXAM_VARIANTS, createAttempt, examVariant, pickDaily, pickExam, pickFlipped, pickHomework,
  parseJsonArray, publicQuestions, quizBankGrade, startDailyQuiz, studentClass, submitAttempt,
} from "../services/quiz.js";
import { SECTIONS, bookWithFiles, materialsForLesson, materialsIn } from "../services/materials.js";
import { CATALOG } from "../data/library.js";
import { nextLessonOf } from "../services/flipped.js";
import { achievementsFor, publicLook, studentStats } from "../services/profile.js";
import { studentAssignedTasks, studentTaskPlay, submitTaskAttempt } from "../services/tasks.js";

export const studentRouter = Router();
studentRouter.use(authenticate, requireRole("student"));

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата в формате ГГГГ-ММ-ДД");

function myGrades(studentId: number, from: string, to: string) {
  return all(
    `SELECT g.value, g.kind, l.date, l.id AS lesson_id, s.id AS subject_id, s.name AS subject, s.code, s.color, ct.title AS topic
       FROM grades g JOIN lessons l ON l.id = g.lesson_id
       JOIN teacher_assignments ta ON ta.id = l.assignment_id JOIN subjects s ON s.id = ta.subject_id
       LEFT JOIN curriculum_topics ct ON ct.id = l.topic_id
      WHERE g.student_id = ? AND l.date BETWEEN ? AND ?
      ORDER BY l.date DESC, l.lesson_no DESC`,
    studentId, from, to,
  );
}

/** Домашние задания: задано на уроке → сдать к следующему уроку по предмету.
 *  Список начинается с сегодняшнего дня: задания со сроком сдачи раньше сегодня не показываются (просроченных не бывает). */
function homeworkList(studentId: number, classId: number, grade: number, from: string, to: string) {
  const rows = all(
    `${LESSON_SELECT} WHERE ta.class_id = ? AND l.date BETWEEN ? AND ? AND l.homework IS NOT NULL ORDER BY l.date DESC, l.lesson_no DESC`,
    classId, from, to,
  );
  const done = new Set(all("SELECT lesson_id FROM homework_done WHERE student_id = ?", studentId).map((r) => r.lesson_id));
  const bank = quizBankGrade(grade);
  const hasQuiz = new Set(
    all("SELECT DISTINCT subject_id || ':' || section_no AS k FROM quiz_questions WHERE grade = ?", bank).map((r) => r.k as string),
  );
  const now = today();
  return rows.flatMap((r) => {
    const l = shapeLesson(r);
    const due = nextLessonOf(r.assignment_id, r.date, r.lesson_no);
    if (due && due.date < now) return [];
    const flipped = !!due?.flipped;
    // к перевёрнутому уроку самопроверка — по новой теме, которую изучают дома
    const canCheck = flipped
      ? due!.section_no != null && hasQuiz.has(`${l.subject.id}:${due!.section_no}`)
      : !!l.topic && [...Array(l.topic.sectionNo)].some((_, i) => hasQuiz.has(`${l.subject.id}:${i + 1}`));
    return [{
      lessonId: l.id, givenOn: l.date, dueOn: due?.date ?? null, subject: l.subject, topic: l.topic, text: l.homework, done: done.has(l.id), canCheck,
      flipped, newTopic: flipped && due!.title ? { title: due!.title as string, paragraph: (due!.paragraph ?? null) as string | null } : null,
    }];
  });
}

/** Мотивация на главной: сколько одноклассников уже прошли квиз сегодня и кого можно догнать по серии */
function classStreaks(meId: number, classId: number, d: string, myStreak: number) {
  const mates = all(
    "SELECT u.id, u.short_name FROM class_students cs JOIN users u ON u.id = cs.student_id WHERE cs.class_id = ?",
    classId,
  ).map((m) => ({ id: m.id as number, name: String(m.short_name).split(" ")[0], ...streakBrief(m.id, d) }));
  const others = mates.filter((m) => m.id !== meId);
  const ahead = others.filter((m) => m.current > myStreak).sort((a, b) => a.current - b.current)[0] ?? null;
  return {
    classToday: { done: mates.filter((m) => m.todayDone).length, total: mates.length },
    rank: {
      place: others.filter((m) => m.current > myStreak).length + 1,
      of: mates.length,
      ahead: ahead ? { name: ahead.name, streak: ahead.current } : null,
    },
  };
}

studentRouter.get("/overview", h((req) => {
  const u = me(req);
  const cls = studentClass(u.id);
  const d = today();
  const todayLessons = markNext(all(`${LESSON_SELECT} WHERE ta.class_id = ? AND l.date = ? ORDER BY l.lesson_no`, cls.id, d).map(shapeLesson));
  let nextDay: string | null = null;
  let upcoming = todayLessons;
  if (!todayLessons.some((l) => l.state !== "past")) {
    const n = get("SELECT MIN(l.date) AS d FROM lessons l JOIN teacher_assignments ta ON ta.id = l.assignment_id WHERE ta.class_id = ? AND l.date > ?", cls.id, d);
    nextDay = n?.d ?? null;
    upcoming = nextDay ? all(`${LESSON_SELECT} WHERE ta.class_id = ? AND l.date = ? ORDER BY l.lesson_no`, cls.id, nextDay).map(shapeLesson) : [];
  }
  const q = currentQuarter();
  const grades = myGrades(u.id, q.from, d);
  const subjMap = new Map<number, { id: number; name: string; code: string; color: string; values: number[] }>();
  for (const g of grades) {
    const o = subjMap.get(g.subject_id) ?? { id: g.subject_id, name: g.subject, code: g.code, color: g.color, values: [] as number[] };
    o.values.push(g.value);
    subjMap.set(g.subject_id, o);
  }
  // те же 2 недели и тот же фильтр, что на странице «Домашние задания» — числа совпадают
  const hwLeft = homeworkList(u.id, cls.id, cls.grade, addDays(d, -14), d).filter((h) => !h.done)
    .sort((x, y) => (x.dueOn ?? "9999").localeCompare(y.dueOn ?? "9999"));
  const hw = hwLeft.slice(0, 5);
  const streak = streakState(u.id, d);
  const attendance = get(
    `SELECT COUNT(*) AS total, SUM(a.status IN ('present','late')) AS present FROM attendance a JOIN lessons l ON l.id = a.lesson_id WHERE a.student_id = ? AND l.date BETWEEN ? AND ?`,
    u.id, q.from, d,
  );
  return {
    date: d,
    isSchoolDay: isSchoolDay(d),
    className: cls.name,
    quarter: q.no,
    today: todayLessons,
    nextDay,
    upcoming: nextDay ? upcoming : [],
    average: avg(grades.map((g) => g.value)),
    attendanceRate: attendance?.total ? Math.round((attendance.present / attendance.total) * 1000) / 10 : null,
    recentGrades: grades.slice(0, 8).map((g) => ({ value: g.value, kind: g.kind, date: g.date, subject: g.subject, color: g.color, topic: g.topic })),
    subjects: [...subjMap.values()].map((s) => ({ id: s.id, name: s.name, code: s.code, color: s.color, average: avg(s.values), count: s.values.length })).sort((a, b) => a.name.localeCompare(b.name, "ru")),
    homework: hw,
    homeworkLeft: hwLeft.length,
    streak: {
      current: streak.current, todayDone: streak.todayDone, atRisk: streak.atRisk, xp: streak.xp,
      week: streak.calendar.slice(-7),
      nextBadge: streak.nextBadge,
      dailySize: DAILY_SIZE,
      ...classStreaks(u.id, cls.id, d, streak.current),
    },
  };
}));

studentRouter.get("/grades", h((req) => {
  const u = me(req);
  const cls = studentClass(u.id);
  // quarter=0 (по умолчанию) — весь учебный год с итогами по четвертям
  const qNo = req.query.quarter === undefined ? 0 : Number(req.query.quarter);
  const q = qNo === 0 ? { no: 0, from: QUARTERS[0].from, to: today() } : QUARTERS.find((x) => x.no === qNo) ?? currentQuarter();
  const to = q.to < today() ? q.to : today();
  const grades = myGrades(u.id, q.from, to);
  const subjects = all(
    `SELECT s.id, s.name, s.code, s.color, u.short_name AS teacher FROM teacher_assignments ta JOIN subjects s ON s.id = ta.subject_id JOIN users u ON u.id = ta.teacher_id WHERE ta.class_id = ? ORDER BY s.name`,
    cls.id,
  );
  // Средний балл класса по предметам — для сравнения (без персональных данных одноклассников)
  const classAvg = new Map(all(
    `SELECT ta.subject_id, ROUND(AVG(g.value), 2) AS a FROM grades g JOIN lessons l ON l.id = g.lesson_id JOIN teacher_assignments ta ON ta.id = l.assignment_id
      WHERE ta.class_id = ? AND l.date BETWEEN ? AND ? GROUP BY ta.subject_id`,
    cls.id, q.from, to,
  ).map((r) => [r.subject_id, r.a]));
  const missed = new Map(all(
    `SELECT ta.subject_id, SUM(a.status IN ('absent','excused')) AS m FROM attendance a JOIN lessons l ON l.id = a.lesson_id JOIN teacher_assignments ta ON ta.id = l.assignment_id
      WHERE a.student_id = ? AND l.date BETWEEN ? AND ? GROUP BY ta.subject_id`,
    u.id, q.from, to,
  ).map((r) => [r.subject_id, r.m]));
  return {
    quarter: q.no,
    quarters: QUARTERS.filter((x) => x.from <= today()).map((x) => x.no),
    from: q.from,
    to,
    average: avg(grades.map((g) => g.value)),
    subjects: subjects.map((s) => {
      const gs = grades.filter((g) => g.subject_id === s.id).reverse();
      return {
        id: s.id, name: s.name, code: s.code, color: s.color, teacher: s.teacher,
        average: avg(gs.map((g) => g.value)),
        quarterAverages: QUARTERS.filter((x) => x.from <= to && x.to >= q.from).map((x) => ({
          no: x.no,
          average: avg(gs.filter((g) => g.date >= x.from && g.date <= x.to).map((g) => g.value)),
        })),
        classAverage: classAvg.get(s.id) ?? null,
        missed: missed.get(s.id) ?? 0,
        grades: gs.map((g) => ({ value: g.value, kind: g.kind, date: g.date, topic: g.topic })),
      };
    }),
  };
}));

studentRouter.get("/schedule", h((req) => {
  const u = me(req);
  const cls = studentClass(u.id);
  const week = mondayOf(req.query.week ? parse(dateStr, req.query.week) : today());
  const lessons = markNext(all(`${LESSON_SELECT} WHERE ta.class_id = ? AND l.date BETWEEN ? AND ? ORDER BY l.date, l.lesson_no`, cls.id, week, addDays(week, 4)).map(shapeLesson));
  const ids = lessons.map((l) => l.id);
  const marks = ids.length
    ? all(`SELECT lesson_id, value, kind FROM grades WHERE student_id = ? AND lesson_id IN (${ids.map(() => "?").join(",")})`, u.id, ...ids)
    : [];
  const att = ids.length
    ? all(`SELECT lesson_id, status FROM attendance WHERE student_id = ? AND lesson_id IN (${ids.map(() => "?").join(",")})`, u.id, ...ids)
    : [];
  const done = new Set(all("SELECT lesson_id FROM homework_done WHERE student_id = ?", u.id).map((r) => r.lesson_id));
  const shown = lessons.map((l) => ({
    ...l,
    // ДЗ ученику видно только после урока (или в день урока)
    homework: l.date <= today() ? l.homework : null,
    myGrades: marks.filter((m) => m.lesson_id === l.id).map((m) => ({ value: m.value, kind: m.kind })),
    myStatus: att.find((a) => a.lesson_id === l.id)?.status ?? null,
    homeworkDone: done.has(l.id),
  }));
  const days = [0, 1, 2, 3, 4].map((i) => {
    const date = addDays(week, i);
    return { date, schoolDay: isSchoolDay(date), lessons: shown.filter((l) => l.date === date) };
  });
  return { week, prev: addDays(week, -7), next: addDays(week, 7), days };
}));

studentRouter.get("/homework", h((req) => {
  const u = me(req);
  const cls = studentClass(u.id);
  const d = today();
  return { items: homeworkList(u.id, cls.id, cls.grade, addDays(d, -14), d) };
}));

function lessonOfMyClass(studentId: number, lessonId: number) {
  const cls = studentClass(studentId);
  const l = get("SELECT l.id, l.date, l.lesson_no, l.homework, l.assignment_id FROM lessons l JOIN teacher_assignments ta ON ta.id = l.assignment_id WHERE l.id = ? AND ta.class_id = ?", lessonId, cls.id);
  if (!l) throw new HttpError(404, "Урок не найден");
  if (l.date > today()) throw new HttpError(400, "Этот урок ещё не прошёл");
  if (!l.homework) throw new HttpError(400, "К этому уроку нет домашнего задания");
  return l;
}

/** Отметить ДЗ выполненным (без самопроверки — стрик не начисляется) */
studentRouter.put("/homework/:lessonId", h((req) => {
  const u = me(req);
  const lessonId = intParam(req.params.lessonId, "lessonId");
  lessonOfMyClass(u.id, lessonId);
  const { done } = parse(z.object({ done: z.boolean() }), req.body);
  if (done) run("INSERT OR IGNORE INTO homework_done (student_id, lesson_id) VALUES (?, ?)", u.id, lessonId);
  else run("DELETE FROM homework_done WHERE student_id = ? AND lesson_id = ?", u.id, lessonId);
  return { done };
}));

/** Самопроверка ДЗ: 3 вопроса по теме урока; ≥ 60 % — засчитывается в стрик */
studentRouter.post("/homework/:lessonId/check", h((req) => {
  const u = me(req);
  const lessonId = intParam(req.params.lessonId, "lessonId");
  const l = lessonOfMyClass(u.id, lessonId);
  const due = nextLessonOf(l.assignment_id, l.date, l.lesson_no);
  const ids = due?.flipped ? pickFlipped(due.id) : pickHomework(lessonId);
  if (ids.length < 2) throw new HttpError(404, "Для этой темы пока нет вопросов самопроверки");
  const attemptId = createAttempt(u.id, "homework", ids, lessonId);
  return { attemptId, mode: "homework", questions: publicQuestions(ids) };
}));

/** id вопросов попытки; битый JSON в базе — пустой список, а не 500 */
const idsOf = (s: unknown) => (parseJsonArray(s) ?? []).filter((x): x is number => Number.isInteger(x));

/** «Квиз дня»: 5 вопросов по пройденным темам своего класса */
studentRouter.post("/quiz/daily", h((req) => {
  const u = me(req);
  // открытая попытка за сегодня или новая — в транзакции, параллельные запросы получают одну и ту же
  const r = startDailyQuiz(u.id, today(), DAILY_SIZE);
  return { attemptId: r.attemptId, mode: "daily", questions: publicQuestions(r.ids) };
}));

studentRouter.post("/quiz/:id/submit", h((req) => {
  const u = me(req);
  const id = intParam(req.params.id);
  const { answers } = parse(z.object({ answers: z.array(z.union([z.number().int().min(0).max(9), z.string().trim().min(1, "Введите ответ").max(100)])).min(1).max(10) }), req.body);
  const result = submitAttempt(u.id, id, answers);
  return { ...result, streak: streakState(u.id) };
}));

/** Карточка одноклассника: фото, рамка, фон, витрина и серия — только для своего класса */
studentRouter.get("/classmates/:id", h((req) => {
  const u = me(req);
  const cls = studentClass(u.id);
  const id = intParam(req.params.id, "id");
  const mate = get(
    "SELECT u.id, u.full_name, u.short_name FROM class_students cs JOIN users u ON u.id = cs.student_id WHERE cs.class_id = ? AND u.id = ?",
    cls.id, id,
  );
  if (!mate) throw new HttpError(404, "Ученик не из вашего класса");
  const st = studentStats(id);
  const ach = achievementsFor(st);
  return {
    id, name: mate.short_name, className: cls.name, me: id === u.id, ...publicLook(id),
    streak: streakBrief(id).current, best: st.best, xp: st.xp,
    achievements: { earned: ach.filter((a) => a.earned).length, total: ach.length },
  };
}));

studentRouter.get("/streak", h((req) => {
  const u = me(req);
  const cls = studentClass(u.id);
  const d = today();
  const state = streakState(u.id, d);
  const classmates = all(
    "SELECT u.id, u.short_name FROM class_students cs JOIN users u ON u.id = cs.student_id WHERE cs.class_id = ?",
    cls.id,
  );
  const weekXp = new Map(all(
    "SELECT student_id, SUM(xp) AS xp FROM streak_days WHERE date BETWEEN ? AND ? GROUP BY student_id",
    mondayOf(d), d,
  ).map((r) => [r.student_id, r.xp]));
  const board = classmates
    .map((c) => ({ id: c.id, name: c.short_name, streak: streakBrief(c.id, d).current, weekXp: Number(weekXp.get(c.id) ?? 0), me: c.id === u.id, ...publicLook(c.id) }))
    .sort((a, b) => b.weekXp - a.weekXp || b.streak - a.streak || a.name.localeCompare(b.name, "ru"))
    .map((x, i) => ({ ...x, place: i + 1 }));
  const todayAttempts = all(
    "SELECT mode, score, total, passed FROM quiz_attempts WHERE student_id = ? AND date = ? AND submitted_at IS NOT NULL ORDER BY id",
    u.id, d,
  );
  const history = all(
    "SELECT date, mode, score, total, passed FROM quiz_attempts WHERE student_id = ? AND submitted_at IS NOT NULL ORDER BY date DESC, id DESC LIMIT 10",
    u.id,
  );
  return { ...state, className: cls.name, leaderboard: board, todayAttempts, history, dailySize: DAILY_SIZE };
}));

/** Учебники своего класса — все предметы каталога для этого класса */
studentRouter.get("/library", h((req) => {
  const cls = studentClass(me(req).id);
  return { textbooks: CATALOG.filter((b) => b.grade === cls.grade).map(bookWithFiles), mine: { subjects: [], grades: [cls.grade] } };
}));

/** Видеоуроки и аудио для своего класса (из папки materials) */
studentRouter.get("/materials/:section", h((req) => {
  const u = me(req);
  const cls = studentClass(u.id);
  const key = parse(z.enum(["video", "audio"]), req.params.section);
  const codes = new Set(all(
    "SELECT s.code FROM teacher_assignments ta JOIN subjects s ON s.id = ta.subject_id WHERE ta.class_id = ?", cls.id,
  ).map((r) => r.code as string));
  return {
    section: { key, ...SECTIONS[key] },
    items: materialsIn(key, { grade: cls.grade }).filter((m) => !m.subject || codes.has(m.subject.code)),
    mine: { subjects: [...codes], grades: [cls.grade] },
  };
}));

/** Подготовка к ЦТ/ЦЭ — только для 10–11 классов */
export const EXAM_MIN_GRADE = 10;
function requireSenior(grade: number) {
  if (grade < EXAM_MIN_GRADE) throw new HttpError(403, "Подготовка к ЦТ/ЦЭ доступна ученикам 10–11 классов");
}

/** Предметы, по которым в Беларуси сдают ЦТ/ЦЭ (и их школьная база в 5–9 классах). */
const EXAM_SUBJECT_CODES = new Set(["math", "algebra", "geometry", "russian", "belarusian", "english", "physics", "history_by", "biology"]);

studentRouter.get("/exam", h((req) => {
  const u = me(req);
  const cls = studentClass(u.id);
  requireSenior(cls.grade);
  const subjects = all(
    `SELECT s.id, s.code, s.name, s.color FROM teacher_assignments ta
       JOIN subjects s ON s.id = ta.subject_id
      WHERE ta.class_id = ? ORDER BY s.name`,
    cls.id,
  ).filter((s) => EXAM_SUBJECT_CODES.has(s.code));

  const attemptRows = all(
    "SELECT question_ids, score, total, date, variant FROM quiz_attempts WHERE student_id = ? AND mode = 'exam' AND submitted_at IS NOT NULL ORDER BY id DESC",
    u.id,
  );
  type VStat = { attempts: number; best: number; lastDate: string | null };
  type SStat = { attempts: number; score: number; total: number; lastDate: string | null; bestPct: number; byVariant: Map<string, VStat> };
  const bySubject = new Map<number, SStat>();
  for (const a of attemptRows) {
    const ids = idsOf(a.question_ids);
    const q = ids.length ? get("SELECT subject_id FROM quiz_questions WHERE id = ?", ids[0]) : null;
    if (!q) continue;
    const cur = bySubject.get(q.subject_id) ?? { attempts: 0, score: 0, total: 0, lastDate: null as string | null, bestPct: 0, byVariant: new Map<string, VStat>() };
    cur.attempts++;
    cur.score += a.score ?? 0;
    cur.total += a.total ?? 0;
    if (!cur.lastDate) cur.lastDate = a.date;
    const pct = a.total ? Math.round((a.score / a.total) * 100) : 0;
    if (pct > cur.bestPct) cur.bestPct = pct;
    if (a.variant) {
      const vs = cur.byVariant.get(a.variant) ?? { attempts: 0, best: 0, lastDate: null as string | null };
      vs.attempts++;
      if (pct > vs.best) vs.best = pct;
      if (!vs.lastDate) vs.lastDate = a.date;
      cur.byVariant.set(a.variant, vs);
    }
    bySubject.set(q.subject_id, cur);
  }

  const items = subjects.map((s) => {
    const st = bySubject.get(s.id);
    const materials = materialsForLesson(s.code, cls.grade)
      .slice(0, 3)
      .map((m) => ({ id: m.id, section: m.section, kind: m.kind, title: m.title, url: m.url }));
    const variantStats = Object.fromEntries(
      EXAM_VARIANTS.map((v) => {
        const vs = st?.byVariant.get(v.id);
        return [v.id, { attempts: vs?.attempts ?? 0, best: vs?.best ?? null, lastDate: vs?.lastDate ?? null }];
      }),
    );
    return {
      id: s.id,
      code: s.code,
      name: s.name,
      color: s.color,
      attempts: st?.attempts ?? 0,
      accuracy: st && st.total ? Math.round((st.score / st.total) * 100) : null,
      best: st?.bestPct ?? null,
      lastDate: st?.lastDate ?? null,
      materials,
      variantStats,
    };
  });

  const totalAttempts = items.reduce((n, s) => n + s.attempts, 0);
  const stage = cls.grade >= 11 ? "exam" : "pre";
  return {
    grade: cls.grade,
    className: cls.name,
    stage,
    stageTitle: stage === "exam" ? "Выпускной год: ЦЭ и ЦТ уже летом" : "10 класс: база к ЦТ и ЦЭ",
    stageHint: stage === "exam"
      ? "Варианты в формате ЦТ/ЦЭ: часть А — выбор ответа, часть В — краткий ответ. Задания — по пройденным темам."
      : "ЦТ и ЦЭ сдают после 11 класса. Тренируйтесь в формате экзамена (часть А и часть В) по темам программы.",
    examSize: EXAM_SIZE,
    totalAttempts,
    partB: EXAM_PART_B,
    variants: EXAM_VARIANTS,
    subjects: items,
  };
}));

studentRouter.post("/exam/:subjectId", h((req) => {
  const u = me(req);
  const cls = studentClass(u.id);
  requireSenior(cls.grade);
  const subjectId = intParam(req.params.subjectId, "subjectId");
  const { variant: variantId } = parse(z.object({ variant: z.string().min(1).max(20) }), req.body ?? {});
  const variant = examVariant(variantId);
  if (!variant) throw new HttpError(400, "Неизвестный вариант теста");
  const subj = get(
    `SELECT s.id, s.code, s.name FROM teacher_assignments ta JOIN subjects s ON s.id = ta.subject_id
      WHERE ta.class_id = ? AND s.id = ?`,
    cls.id, subjectId,
  );
  if (!subj || !EXAM_SUBJECT_CODES.has(subj.code)) throw new HttpError(404, "Предмет недоступен для тренировки");
  const open = get(
    `SELECT id, question_ids, variant FROM quiz_attempts WHERE student_id = ? AND date = ? AND mode = 'exam'
       AND submitted_at IS NULL AND lesson_id IS NULL AND variant = ? ORDER BY id DESC LIMIT 1`,
    u.id, today(), variant.id,
  );
  if (open) {
    const ids = idsOf(open.question_ids);
    const first = ids.length ? get("SELECT subject_id FROM quiz_questions WHERE id = ?", ids[0]) : null;
    if (first?.subject_id === subjectId) {
      return { attemptId: open.id, mode: "exam", questions: publicQuestions(ids), subject: subj.name, variant };
    }
  }
  const ids = pickExam(u.id, subjectId, variant.id);
  if (ids.length < 5) throw new HttpError(404, "Пока недостаточно пройденных тем для тренировки по этому предмету");
  const attemptId = createAttempt(u.id, "exam", ids, null, today(), variant.id);
  return { attemptId, mode: "exam", questions: publicQuestions(ids), subject: subj.name, size: EXAM_SIZE, variant };
}));

const GRADE_KIND_RU: Record<string, string> = { answer: "ответ", independent: "самостоятельная", control: "контрольная", homework: "домашняя" };
const ddmm = (s: string) => `${s.slice(8)}.${s.slice(5, 7)}`;

/** Уведомления ученика: ДЗ на сегодня/завтра, стрик под угрозой, свежие оценки, ближайшие контрольные */
studentRouter.get("/notifications", h((req) => {
  const u = me(req);
  const cls = studentClass(u.id);
  const d = today();
  const tomorrow = addDays(d, 1);
  const items: { id: string; kind: string; title: string; text: string; link: string; tone: "red" | "amber" | "blue" }[] = [];

  const streak = streakState(u.id, d);
  if (streak.atRisk) {
    items.push({ id: "streak", kind: "streak", title: "Стрик под угрозой", text: `Пройдите квиз дня, чтобы сохранить серию: ${streak.current} дн. подряд`, link: "/s/streak", tone: "red" });
  }

  const controls = all(
    `${LESSON_SELECT} WHERE ta.class_id = ? AND l.date >= ? AND l.date <= ? AND ct.kind = 'control' ORDER BY l.date, l.lesson_no`,
    cls.id, d, addDays(d, 3),
  ).map(shapeLesson);
  for (const l of controls) {
    const when = l.date === d ? "сегодня" : l.date === tomorrow ? "завтра" : ddmm(l.date);
    items.push({ id: `c${l.id}`, kind: "control", title: l.date === d ? "Контрольная сегодня" : "Скоро контрольная", text: `${l.subject.name}, ${when}: ${l.topic?.title ?? ""}`, link: "/s/schedule", tone: "red" });
  }

  const hw = homeworkList(u.id, cls.id, cls.grade, addDays(d, -14), d).filter((x) => !x.done && x.dueOn && (x.dueOn === d || x.dueOn === tomorrow));
  for (const x of hw.sort((a, b) => (a.dueOn! < b.dueOn! ? -1 : 1))) {
    items.push({ id: `h${x.lessonId}`, kind: "homework", title: x.dueOn === d ? "ДЗ на сегодня" : "ДЗ на завтра", text: `${x.subject.name}: ${x.text}`, link: "/s/homework", tone: "amber" });
  }

  const flipTomorrow = all(
    `${LESSON_SELECT} WHERE ta.class_id = ? AND l.date = ? AND l.flipped = 1 ORDER BY l.lesson_no`,
    cls.id, tomorrow,
  ).map(shapeLesson);
  if (flipTomorrow.length) {
    items.push({
      id: `flip${tomorrow}`, kind: "flipped", title: "Завтра перевёрнутый урок",
      text: `${flipTomorrow.map((l) => l.subject.name).join(", ")}: новую тему изучите дома — что прочитать, написано в ДЗ`,
      link: "/s/homework", tone: "blue",
    });
  }

  const fresh = myGrades(u.id, addDays(d, -2), d).slice(0, 5);
  for (const g of fresh) {
    items.push({ id: `g${g.lesson_id}-${g.kind}-${g.value}`, kind: "grade", title: `Новая оценка: ${g.value}`, text: `${g.subject}, ${GRADE_KIND_RU[g.kind] ?? g.kind}, ${ddmm(g.date)}${g.topic ? ` · ${g.topic}` : ""}`, link: "/s/grades", tone: "blue" });
  }

  const assigned = studentAssignedTasks(u.id, cls.id).filter((t) => !t.done).slice(0, 3);
  for (const t of assigned) {
    items.push({
      id: `task${t.id}`, kind: "task", title: "Интерактивное задание",
      text: `${t.subject?.name ? `${t.subject.name}: ` : ""}${t.title}`,
      link: "/s/homework", tone: "blue",
    });
  }
  return { items };
}));

/** Интерактивные задания, назначенные классу из конструктора учителя */
studentRouter.get("/tasks", h((req) => {
  const u = me(req);
  const cls = studentClass(u.id);
  return { items: studentAssignedTasks(u.id, cls.id) };
}));

studentRouter.get("/tasks/:assignmentId", h((req) => {
  const u = me(req);
  const cls = studentClass(u.id);
  return studentTaskPlay(u.id, cls.id, intParam(req.params.assignmentId, "assignmentId"));
}));

studentRouter.post("/tasks/:assignmentId/submit", h((req) => {
  const u = me(req);
  const cls = studentClass(u.id);
  const { score, total } = parse(z.object({
    score: z.number().int(),
    total: z.number().int().positive(),
  }), req.body ?? {});
  return submitTaskAttempt(u.id, cls.id, intParam(req.params.assignmentId, "assignmentId"), score, total);
}));
