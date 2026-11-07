/**
 * Наполнение демо-базы. Всё строится относительно «сегодня» (или KLASNA_TODAY),
 * поэтому перед показом достаточно выполнить `npm run seed`.
 */
import bcrypt from "bcryptjs";
import { db, migrate, run, get, all, tx } from "./db.js";
import { CURRICULA, expand } from "./data/curriculum.js";
import { QUESTIONS } from "./data/questions.js";
import { SENIOR_QUESTIONS } from "./data/questions-senior.js";
import { SUBJECTS, TEXTBOOKS } from "./data/resources.js";
import { ASSIGNMENTS, CLASSES, DEMO_STUDENT, DEMO_STUDENT_11, TEACHERS, makeName } from "./data/school.js";
import { QUARTERS, YEAR_START, addDays, isSchoolDay, today, weekday } from "./calendar.js";
import { insertSeniorQuestions, insertShortQuestions, createAttempt, pickDaily, submitAttempt } from "./services/quiz.js";
import { makeJoinCode } from "./services/registration.js";
import { fillMissingTopics } from "./services/curriculum-sync.js";
import { seedDemoTasks } from "./services/tasks.js";
import { markDemoFlipped } from "./services/flipped.js";
import { achievementsFor, backgroundsFor, framesFor, studentStats } from "./services/profile.js";

// ── детерминированный генератор случайных чисел ──
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260901);
const gauss = () => {
  const u = 1 - rand(), v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const shuffle = <T,>(a: T[]) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};


const TODAY = today();
const SEED_END = QUARTERS[1].to; // уроки генерируем до конца II четверти
const STREAK_LAUNCH = addDays(TODAY, -35); // «Квиз дня» запущен ~5 недель назад

function reset() {
  db.exec("PRAGMA foreign_keys = OFF");
  const tables = all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'");
  for (const t of tables) db.exec(`DROP TABLE IF EXISTS "${t.name}"`);
  db.exec("PRAGMA foreign_keys = ON");
  migrate();
}

function validateQuestions(topicsBySubjectGrade: Map<string, number>) {
  const problems: string[] = [];
  for (const [subject, grade, section, q, options, correct] of [...QUESTIONS, ...SENIOR_QUESTIONS]) {
    const maxSection = topicsBySubjectGrade.get(`${subject}:${grade}`);
    if (maxSection == null) problems.push(`Нет программы ${subject} ${grade} кл. для вопроса «${q}»`);
    else if (section < 1 || section > maxSection) problems.push(`Раздел ${section} вне программы ${subject} ${grade} кл.: «${q}»`);
    if (correct < 0 || correct >= options.length) problems.push(`Неверный индекс ответа: «${q}»`);
    if (new Set(options).size !== options.length) problems.push(`Повторяющиеся варианты: «${q}»`);
  }
  if (problems.length) throw new Error("Банк вопросов не согласован с программой:\n" + problems.join("\n"));
}

export function seed() {
  const origRandom = Math.random;
  Math.random = rand; // подбор вопросов в сиде воспроизводим
  try {
    seedInner();
  } finally {
    Math.random = origRandom;
  }
}

function seedInner() {
  console.log(`Сид «Класны» на дату ${TODAY}…`);
  reset();
  const hash = bcrypt.hashSync("demo", 8);

  tx(() => {
    // ── предметы ──
    const subjectId = new Map<string, number>();
    for (const s of SUBJECTS) {
      subjectId.set(s.code, Number(run("INSERT INTO subjects (code, name, color) VALUES (?,?,?)", s.code, s.name, s.color).lastInsertRowid));
    }

    // ── учителя ──
    const teacherId = new Map<string, number>();
    const teacherRoom = new Map<string, string>();
    for (const t of TEACHERS) {
      const id = Number(run("INSERT INTO users (login, password_hash, role, full_name, short_name) VALUES (?,?,?,?,?)", t.login, hash, "teacher", t.full, t.short).lastInsertRowid);
      teacherId.set(t.login, id);
      teacherRoom.set(t.login, t.room);
    }

    // ── классы и ученики ──
    const classId = new Map<string, number>();
    const usedNames = new Set<string>(["Шевчук Алеся", "Карпович Даниил"]);
    type Student = { id: number; classId: number; ability: number; absence: number; engagement: number };
    const students: Student[] = [];
    let sNo = 1;
    for (const c of CLASSES) {
      const cid = Number(run("INSERT INTO classes (name, grade, homeroom_teacher_id, join_code) VALUES (?,?,?,?)", c.name, c.grade, teacherId.get(c.homeroom), makeJoinCode(c.name, rand)).lastInsertRowid);
      classId.set(c.name, cid);
      const riskIdx = new Set([Math.floor(rand() * c.size), Math.floor(rand() * c.size)]);
      for (let i = 0; i < c.size; i++) {
        const isDemo = c.name === DEMO_STUDENT.className && i === 0;
        const isDemo11 = c.name === DEMO_STUDENT_11.className && i === 0;
        const n = isDemo ? { full: DEMO_STUDENT.full, short: DEMO_STUDENT.short }
          : isDemo11 ? { full: DEMO_STUDENT_11.full, short: DEMO_STUDENT_11.short } : makeName(rand, usedNames);
        const login = isDemo ? "student" : isDemo11 ? DEMO_STUDENT_11.login : `s${String(sNo++).padStart(3, "0")}`;
        const id = Number(run("INSERT INTO users (login, password_hash, role, full_name, short_name) VALUES (?,?,?,?,?)", login, hash, "student", n.full, n.short).lastInsertRowid);
        run("INSERT INTO class_students (student_id, class_id) VALUES (?,?)", id, cid);
        const risky = !isDemo && riskIdx.has(i);
        students.push({
          id,
          classId: cid,
          ability: isDemo ? 7.6 : clamp(6.6 + gauss() * 1.5, 3.8, 9.7),
          absence: risky ? 0.1 + rand() * 0.08 : 0.015 + rand() * 0.03,
          engagement: isDemo ? 1 : clamp(0.55 + gauss() * 0.25, 0.08, 0.97),
        });
      }
    }

    // ── нагрузка ──
    type Asg = { id: number; cls: string; classId: number; subject: string; teacher: string; hours: number; grade: number };
    const asgs: Asg[] = ASSIGNMENTS.map(([cls, subject, teacher, hours]) => {
      const id = Number(run(
        "INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, hours_per_week) VALUES (?,?,?,?)",
        teacherId.get(teacher), classId.get(cls), subjectId.get(subject), hours,
      ).lastInsertRowid);
      return { id, cls, classId: classId.get(cls)!, subject, teacher, hours, grade: CLASSES.find((c) => c.name === cls)!.grade };
    });

    // ── расписание: каждый предмет в разные дни, без накладок учителя, без «окон» у класса ──
    const busyTeacher = new Set<string>(); // teacher:day:no
    const busyClass = new Set<string>(); // class:day:no
    const dayLoad = new Map<string, number>(); // class:day → кол-во уроков
    const slots: { asg: Asg; day: number; no: number }[] = [];
    const order = shuffle([...asgs]).sort((a, b) => b.hours - a.hours);
    for (const a of order) {
      const days = [1, 2, 3, 4, 5]
        .sort((x, y) => (dayLoad.get(`${a.cls}:${x}`) ?? 0) - (dayLoad.get(`${a.cls}:${y}`) ?? 0) || rand() - 0.5)
        .slice(0, a.hours);
      for (const day of days) {
        let placed = false;
        for (let no = 1; no <= 7 && !placed; no++) {
          if (busyClass.has(`${a.cls}:${day}:${no}`) || busyTeacher.has(`${a.teacher}:${day}:${no}`)) continue;
          busyClass.add(`${a.cls}:${day}:${no}`);
          busyTeacher.add(`${a.teacher}:${day}:${no}`);
          dayLoad.set(`${a.cls}:${day}`, (dayLoad.get(`${a.cls}:${day}`) ?? 0) + 1);
          slots.push({ asg: a, day, no });
          placed = true;
        }
        if (!placed) throw new Error(`Не удалось поставить ${a.subject} в ${a.cls}`);
      }
    }
    // Уплотнение: сдвигаем уроки вверх, чтобы не было «окон»
    for (let changed = true; changed; ) {
      changed = false;
      for (const s of slots.sort((x, y) => x.no - y.no)) {
        const prev = s.no - 1;
        if (prev < 1) continue;
        if (!busyClass.has(`${s.asg.cls}:${s.day}:${prev}`) && !busyTeacher.has(`${s.asg.teacher}:${s.day}:${prev}`)) {
          busyClass.delete(`${s.asg.cls}:${s.day}:${s.no}`);
          busyTeacher.delete(`${s.asg.teacher}:${s.day}:${s.no}`);
          s.no = prev;
          busyClass.add(`${s.asg.cls}:${s.day}:${s.no}`);
          busyTeacher.add(`${s.asg.teacher}:${s.day}:${s.no}`);
          changed = true;
        }
      }
    }
    const slotRows = slots.map((s) => ({
      ...s,
      id: Number(run("INSERT INTO schedule_slots (assignment_id, weekday, lesson_no, room) VALUES (?,?,?,?)", s.asg.id, s.day, s.no, teacherRoom.get(s.asg.teacher)).lastInsertRowid),
    }));

    // ── программа (тема на каждый урок) ──
    const topicIds = new Map<string, { id: number; kind: string; paragraph: string | null; title: string }[]>();
    const maxSection = new Map<string, number>();
    for (const c of CURRICULA) {
      const list = expand(c).map((t) => ({
        id: Number(run(
          "INSERT INTO curriculum_topics (subject_id, grade, seq, section_no, section, title, paragraph, kind) VALUES (?,?,?,?,?,?,?,?)",
          subjectId.get(c.subject), c.grade, t.seq, t.sectionNo, t.section, t.title, t.paragraph, t.kind,
        ).lastInsertRowid),
        kind: t.kind, paragraph: t.paragraph, title: t.title,
      }));
      topicIds.set(`${c.subject}:${c.grade}`, list);
      maxSection.set(`${c.subject}:${c.grade}`, c.sections.length);
    }
    validateQuestions(maxSection);
    for (const a of asgs) if (!topicIds.has(`${a.subject}:${a.grade}`)) throw new Error(`Нет программы для ${a.subject} ${a.grade}`);

    for (const [subject, grade, section, question, options, correct, explanation] of QUESTIONS) {
      run("INSERT INTO quiz_questions (subject_id, grade, section_no, question, options, correct, explanation) VALUES (?,?,?,?,?,?,?)",
        subjectId.get(subject), grade, section, question, JSON.stringify(options), correct, explanation);
    }
    insertShortQuestions();
    insertSeniorQuestions();

    // ── учебники (метаданные; PDF подхватываются из materials/Учебники) ──
    for (const t of TEXTBOOKS) {
      run("INSERT INTO textbooks (subject_id, grade, title, authors, language, url) VALUES (?,?,?,?,?,?)", subjectId.get(t.subject), t.grade, t.title, t.authors, t.language, "");
    }

    // ── уроки на I–II четверть с темами по порядку программы ──
    const seqByAsg = new Map<number, number>();
    const lessonsByDate = new Map<string, { id: number; asg: Asg; topic: (typeof topicIds extends Map<any, infer V> ? V : never)[number] | null }[]>();
    for (let d = YEAR_START; d <= SEED_END; d = addDays(d, 1)) {
      if (!isSchoolDay(d)) continue;
      const wd = weekday(d);
      for (const s of slotRows.filter((x) => x.day === wd).sort((x, y) => x.no - y.no)) {
        const list = topicIds.get(`${s.asg.subject}:${s.asg.grade}`)!;
        const n = seqByAsg.get(s.asg.id) ?? 0;
        seqByAsg.set(s.asg.id, n + 1);
        const topic = list[n] ?? null;
        const id = Number(run("INSERT INTO lessons (slot_id, assignment_id, date, lesson_no, topic_id) VALUES (?,?,?,?,?)", s.id, s.asg.id, d, s.no, topic?.id ?? null).lastInsertRowid);
        if (!lessonsByDate.has(d)) lessonsByDate.set(d, []);
        lessonsByDate.get(d)!.push({ id, asg: s.asg, topic });
      }
    }

    // ── журнал: посещаемость, оценки, ДЗ за прошедшие дни ──
    const studentsByClass = new Map<number, Student[]>();
    for (const s of students) {
      if (!studentsByClass.has(s.classId)) studentsByClass.set(s.classId, []);
      studentsByClass.get(s.classId)!.push(s);
    }
    const sick = new Map<number, number>(); // студент → дней болезни осталось
    const hwText = (a: Asg, paragraph: string | null) => {
      const p = paragraph ?? "";
      switch (a.subject) {
        case "math": case "algebra": case "geometry": {
          const n = 100 + Math.floor(rand() * 400);
          return `${p}, № ${n}, ${n + 2}, ${n + 5}`;
        }
        case "russian": case "belarusian": return `${p}, упр. ${50 + Math.floor(rand() * 300)}`;
        case "english": return `Workbook p. ${10 + Math.floor(rand() * 60)}, ex. ${1 + Math.floor(rand() * 6)}; learn new words`;
        default: return `${p}, ответить на вопросы после параграфа`;
      }
    };

    // Последний прошедший урок геометрии в 9А оставляем незаполненным — демо «напоминания»
    let unmarkedDemo: number | null = null;
    for (const [d, list] of [...lessonsByDate].reverse()) {
      if (d >= TODAY) continue;
      const l = list.find((x) => x.asg.cls === "9А" && x.asg.subject === "geometry");
      if (l) { unmarkedDemo = l.id; break; }
    }

    for (const [d, list] of lessonsByDate) {
      if (d > TODAY) continue;
      for (const l of list) if (l.topic) run("UPDATE lessons SET homework = ? WHERE id = ?", hwText(l.asg, l.topic.paragraph), l.id);
      if (d === TODAY) continue;

      // Состояние учеников на день
      const dayStatus = new Map<number, "present" | "absent" | "excused">();
      for (const s of students) {
        const left = sick.get(s.id) ?? 0;
        if (left > 0) { dayStatus.set(s.id, "excused"); sick.set(s.id, left - 1); continue; }
        if (rand() < s.absence * 0.25) { sick.set(s.id, 1 + Math.floor(rand() * 4)); dayStatus.set(s.id, "excused"); continue; }
        dayStatus.set(s.id, rand() < s.absence * 0.75 ? "absent" : "present");
      }

      for (const l of list) {
        if (l.id === unmarkedDemo) continue;
        run("UPDATE lessons SET marked_at = ? WHERE id = ?", `${d} 15:00:00`, l.id);
        const cls = studentsByClass.get(l.asg.classId)!;
        const present: Student[] = [];
        for (const s of cls) {
          let st: string = dayStatus.get(s.id)!;
          if (st === "present" && rand() < 0.012) st = "late";
          if (st === "present" && rand() < s.absence * 0.08) st = "absent"; // ушёл с урока
          run("INSERT INTO attendance (lesson_id, student_id, status) VALUES (?,?,?)", l.id, s.id, st);
          if (st === "present" || st === "late") present.push(s);
        }
        const grade = (s: Student, bias = 0, spread = 1.2) => Math.round(clamp(s.ability + bias + gauss() * spread, 1, 10));
        if (l.topic?.kind === "control") {
          for (const s of present) run("INSERT INTO grades (lesson_id, student_id, value, kind) VALUES (?,?,?,?)", l.id, s.id, grade(s, -0.4, 1.4), "control");
        } else {
          // За урок у ученика только одна оценка — либо ответ, либо самостоятельная на повторении
          const kind = l.topic?.kind === "review" && rand() < 0.35 ? "independent" : "answer";
          const marked = kind === "independent"
            ? present.filter(() => rand() < 0.5)
            : shuffle([...present]).slice(0, 2 + Math.floor(rand() * 4));
          for (const s of marked) run("INSERT INTO grades (lesson_id, student_id, value, kind) VALUES (?,?,?,?)", l.id, s.id, grade(s, kind === "independent" ? -0.1 : 0.2), kind);
        }
      }
    }

    // ── домашние задания, отмеченные учениками (последние 2 недели) ──
    for (const [d, list] of lessonsByDate) {
      if (d >= TODAY || d < addDays(TODAY, -14)) continue;
      for (const l of list) for (const s of studentsByClass.get(l.asg.classId)!) {
        // демо-ученица: старые задания сдала, свежие (за 3 дня) — частично
        const doneIt = s.engagement === 1 ? (d < addDays(TODAY, -3) || rand() < 0.35) : rand() < s.engagement * 0.7;
        if (doneIt) run("INSERT OR IGNORE INTO homework_done (student_id, lesson_id, done_at) VALUES (?,?,?)", s.id, l.id, `${d} 19:00:00`);
      }
    }

    // ── история «Квиза дня» — через тот же код, что и в API ──
    for (const s of students) {
      const isDemo = s.engagement === 1;
      let momentum = rand() < s.engagement;
      for (let d = STREAK_LAUNCH; d <= TODAY; d = addDays(d, 1)) {
        const school = isSchoolDay(d);
        let p = school ? s.engagement : s.engagement * 0.3;
        p = momentum ? Math.min(0.98, p + 0.15) : p * 0.7;
        // Сегодня часть класса уже прошла квиз (день ещё идёт); демо-ученица — нет, у неё серия «под угрозой»
        if (d === TODAY) { if (isDemo) break; p *= 0.6; }
        // Демо-ученица: серия 12+ дней, заканчивается вчера (сегодня — «под угрозой»)
        // до серии — занималась почти каждый день, затем короткий перерыв (2–3 дня), с него и началась текущая серия
        const doIt = isDemo
          ? d >= addDays(TODAY, -18) ? (school || rand() < 0.4) : d < addDays(TODAY, -21) && (school ? rand() < 0.9 : rand() < 0.35)
          : rand() < p;
        momentum = doIt;
        if (!doIt) continue;
        const ids = pickDaily(s.id, d);
        if (ids.length < 3) continue;
        const attempt = createAttempt(s.id, "daily", ids, null, d);
        const pCorrect = clamp(0.3 + s.ability * 0.065, 0.35, 0.95);
        const qs = all(`SELECT id, correct, options FROM quiz_questions WHERE id IN (${ids.join(",")})`);
        const byId = new Map(qs.map((q) => [q.id, q]));
        const answers = ids.map((id) => {
          const q = byId.get(id)!;
          const n = JSON.parse(q.options).length;
          if (rand() < (isDemo ? 0.9 : pCorrect)) return q.correct as number;
          return (q.correct + 1 + Math.floor(rand() * (n - 1))) % n;
        });
        const r = submitAttempt(s.id, attempt, answers, d);
        if (isDemo && !r.passed) {
          // Демо-ученица пересдаёт — так и задумано: стрик только за успешный квиз
          const again = createAttempt(s.id, "daily", ids, null, d);
          submitAttempt(s.id, again, ids.map((id) => byId.get(id)!.correct as number), d);
        }
      }
    }
  });

  // Демо-задания конструктора у учителя математики
  const demoTeacher = get("SELECT id FROM users WHERE login = 'teacher'");
  if (demoTeacher) seedDemoTasks(demoTeacher.id);
  fillMissingTopics(); // уроки за концом программы получают тему «Повторение и обобщение», а не NULL
  markDemoFlipped(TODAY);
  // Демо-ученица: достижения на витрине, рамка и фон — чтобы профиль было видно сразу
  const demoStudent = get("SELECT id FROM users WHERE login = 'student'");
  if (demoStudent) {
    const st = studentStats(demoStudent.id, TODAY);
    const pick = ["streak14", "comeback", "perfect1", "streak3", "quiz1"];
    const earned = new Set(achievementsFor(st).filter((a) => a.earned).map((a) => a.id));
    const showcase = pick.filter((id) => earned.has(id)).slice(0, 3);
    const frame = framesFor(st).filter((f) => f.unlocked).pop()?.id ?? null;
    const background = backgroundsFor(st).filter((x) => x.unlocked).pop()?.id ?? null;
    run("UPDATE users SET showcase = ?, frame = ?, background = ? WHERE id = ?", JSON.stringify(showcase), frame, background, demoStudent.id);
  }

  const counts = ["users", "lessons", "attendance", "grades", "curriculum_topics", "quiz_questions", "quiz_attempts", "streak_days", "tasks"]
    .map((t) => `${t}: ${get(`SELECT COUNT(*) AS n FROM ${t}`)!.n}`);
  console.log(counts.join(" · "));
  console.log("Готово. Демо-входы: teacher / demo, student / demo (7Б), student11 / demo (11А, ЦТ/ЦЭ)");
}

if (process.argv[1] && /seed\.(ts|js)$/.test(process.argv[1])) seed();
