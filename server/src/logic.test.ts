/**
 * Тесты серверной логики: заполненность журнала, темы уроков сверх программы,
 * предмет заданий конструктора, устойчивость к битому JSON, детерминированный «Квиз дня».
 * Отдельная временная база — data/klasna.db не трогается.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type { Server } from "node:http";

const dbFile = path.join(os.tmpdir(), `klasna-logic-test-${process.pid}.db`);
process.env.KLASNA_DB = dbFile;
process.env.KLASNA_TODAY = "2026-11-05";
process.env.KLASNA_NOW = "10:40";
const matDir = path.join(os.tmpdir(), `klasna-logic-materials-${process.pid}`);
fs.mkdirSync(matDir, { recursive: true });
process.env.KLASNA_MATERIALS = matDir;

const TODAY = "2026-11-05";
let server: Server;
let base = "";
let db: typeof import("./db.js");
let sync: typeof import("./services/curriculum-sync.js");
let quiz: typeof import("./services/quiz.js");
let registration: typeof import("./services/registration.js");

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(base + url, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}
async function login(loginName: string, role: "teacher" | "student") {
  const r = await call("POST", "/api/auth/login", undefined, { login: loginName, password: "demo", role });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return r.json.token as string;
}
const nullTopics = () => Number(db.get("SELECT COUNT(*) AS n FROM lessons WHERE topic_id IS NULL")!.n);
const userId = (login: string) => db.get("SELECT id FROM users WHERE login = ?", login)!.id as number;

before(async () => {
  db = await import("./db.js");
  db.migrate();
  const { seed } = await import("./seed.js");
  seed();
  sync = await import("./services/curriculum-sync.js");
  quiz = await import("./services/quiz.js");
  registration = await import("./services/registration.js");
  const { createApp } = await import("./app.js");
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

after(async () => {
  await new Promise((r) => server?.close(r));
  db?.db.close();
  for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) fs.rmSync(f, { force: true });
  fs.rmSync(matDir, { recursive: true, force: true });
});

// ── п. 6: урок считается заполненным при любом содержательном сохранении ──
test("журнал: оценки / тема / ДЗ без посещаемости тоже заполняют урок", async () => {
  const t = await login("teacher", "teacher");
  // Четыре прошедших урока учителя делаем незаполненными
  const past = db.all(`SELECT l.id FROM lessons l JOIN teacher_assignments ta ON ta.id = l.assignment_id JOIN users u ON u.id = ta.teacher_id
    WHERE u.login = 'teacher' AND l.date < ? AND l.date >= '2026-11-02' ORDER BY l.date DESC, l.lesson_no LIMIT 4`, TODAY);
  assert.equal(past.length, 4);
  for (const p of past) db.run("UPDATE lessons SET marked_at = NULL WHERE id = ?", p.id);
  const dash = await call("GET", "/api/teacher/dashboard", t);
  assert.equal(dash.status, 200);
  const byId = new Map(dash.json.unmarked.map((l: any) => [l.id, l]));
  const [l1, l2, l3, l4] = past.map((p) => byId.get(p.id) as any);
  assert.ok(l1 && l2 && l3 && l4, "уроки видны как незаполненные");

  // только оценка
  const detail = await call("GET", `/api/teacher/lessons/${l1.id}`, t);
  const student = detail.json.students[0];
  assert.equal(detail.json.lesson.marked, false);
  const g = await call("PUT", `/api/teacher/lessons/${l1.id}`, t, { grades: [{ studentId: student.id, kind: "answer", value: 8 }] });
  assert.equal(g.status, 200, JSON.stringify(g.json));
  assert.equal((await call("GET", `/api/teacher/lessons/${l1.id}`, t)).json.lesson.marked, true);

  // только ДЗ
  assert.equal((await call("PUT", `/api/teacher/lessons/${l2.id}`, t, { homework: "§ 3, № 10" })).status, 200);
  // только тема
  const topics = (await call("GET", `/api/teacher/lessons/${l3.id}`, t)).json.topics;
  assert.equal((await call("PUT", `/api/teacher/lessons/${l3.id}`, t, { topicId: topics[0].id })).status, 200);

  const after = await call("GET", "/api/teacher/dashboard", t);
  const stillUnmarked = new Set(after.json.unmarked.map((l: any) => l.id));
  for (const l of [l1, l2, l3]) assert.ok(!stillUnmarked.has(l.id), `урок ${l.id} больше не «не заполнен» на главной`);
  assert.equal(after.json.stats.lessonsDone, dash.json.stats.lessonsDone + 3, "метрика «проведено уроков» выросла");
  const notes = (await call("GET", "/api/teacher/notifications", t)).json.items.map((x: any) => x.id);
  for (const l of [l1, l2, l3]) assert.ok(!notes.includes(`u${l.id}`), "нет уведомления «Журнал не заполнен»");

  // программа (КТП): тема урока с оценкой — «пройдено», а не «не заполнено»
  const program = await call("GET", `/api/teacher/curriculum?classId=${l1.classId}&subjectId=${l1.subject.id}`, t);
  const topicRow = program.json.sections.flatMap((s: any) => s.topics).find((x: any) => x.lessonId === l1.id);
  if (topicRow) assert.equal(topicRow.status, "done");

  // время первого заполнения не перезаписывается
  const markedAt = db.get("SELECT marked_at FROM lessons WHERE id = ?", l1.id)!.marked_at;
  db.run("UPDATE lessons SET marked_at = '2026-11-01 12:00:00' WHERE id = ?", l1.id);
  await call("PUT", `/api/teacher/lessons/${l1.id}`, t, { attendance: [{ studentId: student.id, status: "present" }] });
  assert.equal(db.get("SELECT marked_at FROM lessons WHERE id = ?", l1.id)!.marked_at, "2026-11-01 12:00:00");
  assert.ok(markedAt);

  // будущий урок: ДЗ заранее — урок ещё не «заполнен»; «следующий — перевёрнутый» тоже не заполняет
  const future = db.get(`SELECT l.id FROM lessons l JOIN teacher_assignments ta ON ta.id = l.assignment_id JOIN users u ON u.id = ta.teacher_id
    WHERE u.login = 'teacher' AND l.date > ? ORDER BY l.date LIMIT 1`, TODAY)!;
  assert.equal((await call("PUT", `/api/teacher/lessons/${future.id}`, t, { homework: "подготовиться" })).status, 200);
  assert.equal(db.get("SELECT marked_at FROM lessons WHERE id = ?", future.id)!.marked_at, null);
  assert.ok(stillUnmarked.has(l4.id));
  await call("PUT", `/api/teacher/lessons/${l4.id}`, t, { nextFlipped: false });
  assert.equal(db.get("SELECT marked_at FROM lessons WHERE id = ?", l4.id)!.marked_at, null);
});

// ── п. 8: регистрация учителя — программа короче календаря ──
test("регистрация: уроки сверх программы получают резервную тему «Повторение и обобщение»", () => {
  const grade = 8;
  const code = registration.subjectsForGrade(grade)[0].code as string;
  const subjectId = db.get("SELECT id FROM subjects WHERE code = ?", code)!.id as number;
  // В демо-школе нет 8 классов — укорачиваем программу до 3 тем, как будто она короче календаря
  assert.equal(Number(db.get("SELECT COUNT(*) AS n FROM teacher_assignments ta JOIN classes c ON c.id = ta.class_id WHERE c.grade = ?", grade)!.n), 0);
  db.run("DELETE FROM curriculum_topics WHERE subject_id = ? AND grade = ? AND seq > 3", subjectId, grade);

  const teacherId = registration.registerTeacher({
    fullName: "Тестова Анна Сергеевна", login: "logic_t8", password: "Secret123!", schoolCode: registration.SCHOOL_CODE,
    grade, letter: "Я", subjects: [code],
  });
  const lessons = db.all(`SELECT l.topic_id, ct.kind, ct.title, ct.seq, ct.section_no FROM lessons l JOIN teacher_assignments ta ON ta.id = l.assignment_id
    LEFT JOIN curriculum_topics ct ON ct.id = l.topic_id WHERE ta.teacher_id = ?`, teacherId);
  assert.ok(lessons.length > 0, "уроки созданы");
  assert.ok(lessons.every((l) => l.topic_id != null), "ни одного урока без темы");
  assert.ok(lessons.every((l) => l.title === sync.RESERVE_TITLE && l.kind === "review"), "за концом программы — урок повторения");
  const reserve = db.get("SELECT * FROM curriculum_topics WHERE subject_id = ? AND grade = ? AND title = ?", subjectId, grade, sync.RESERVE_TITLE)!;
  assert.equal(reserve.seq, 4, "резерв стоит сразу после программы");
  assert.equal(reserve.section, sync.RESERVE_SECTION);
  assert.equal(Number(db.get("SELECT COUNT(*) AS n FROM curriculum_topics WHERE subject_id = ? AND grade = ? AND title = ?", subjectId, grade, sync.RESERVE_TITLE)!.n), 1);

  // Синхронизация при старте возвращает полную программу 8 класса: резерв уезжает в конец, ничего не теряется
  sync.syncExtraCurricula();
  const full = db.get("SELECT MAX(seq) AS seq, COUNT(*) AS n FROM curriculum_topics WHERE subject_id = ? AND grade = ?", subjectId, grade)!;
  const moved = db.get("SELECT id, seq, section_no FROM curriculum_topics WHERE id = ?", reserve.id)!;
  assert.equal(moved.seq, full.seq, "резервная тема — последняя");
  assert.equal(Number(full.n), Number(full.seq), "номера тем без пропусков: программа восстановлена целиком");
  assert.ok(moved.section_no > Number(db.get("SELECT MAX(section_no) AS m FROM curriculum_topics WHERE subject_id = ? AND grade = ? AND id <> ?", subjectId, grade, reserve.id)!.m));
  assert.equal(nullTopics(), 0);
});

// ── п. 7: syncExtraCurricula — уроков больше, чем тем ──
test("синхронизация программ: уроки за концом программы не остаются без темы, повторный запуск ничего не меняет", () => {
  // Лишние уроки после конца учебного года (позиция за концом программы) — в 11А (синхронизируемый класс) и в 7Б
  const extra: number[] = [];
  for (const cls of ["11А", "7Б"]) {
    const slot = db.get(`SELECT ss.id, ss.assignment_id, ss.lesson_no FROM schedule_slots ss JOIN teacher_assignments ta ON ta.id = ss.assignment_id
      JOIN classes c ON c.id = ta.class_id WHERE c.name = ? ORDER BY ss.id LIMIT 1`, cls)!;
    for (const date of ["2027-06-01", "2027-06-02", "2027-06-03"]) {
      extra.push(Number(db.run("INSERT INTO lessons (slot_id, assignment_id, date, lesson_no, topic_id) VALUES (?,?,?,?,NULL)",
        slot.id, slot.assignment_id, date, slot.lesson_no).lastInsertRowid));
    }
  }
  assert.equal(nullTopics(), extra.length);
  sync.syncExtraCurricula();
  assert.equal(nullTopics(), 0, "после синхронизации у всех уроков есть тема");
  const rows = db.all(`SELECT ct.title, ct.kind FROM lessons l JOIN curriculum_topics ct ON ct.id = l.topic_id WHERE l.id IN (${extra.join(",")})`);
  assert.ok(rows.every((r) => r.title === sync.RESERVE_TITLE && r.kind === "review"));

  const snapshot = () => JSON.stringify([
    db.all("SELECT id, subject_id, grade, seq, section_no, title FROM curriculum_topics ORDER BY id"),
    db.all("SELECT id, topic_id FROM lessons ORDER BY id"),
  ]);
  const before = snapshot();
  sync.syncExtraCurricula();
  sync.syncExtraCurricula();
  assert.equal(snapshot(), before, "идемпотентно: при каждом старте сервера одно и то же");
});

// ── п. 16: задания конструктора — только по своим предметам ──
test("конструктор заданий: нельзя привязать задание к чужому предмету", async () => {
  const t = await login("teacher", "teacher");
  const subj = (code: string) => db.get("SELECT id FROM subjects WHERE code = ?", code)!.id as number;
  const data = { pairs: [{ a: "1", b: "один" }, { a: "2", b: "два" }] };
  const foreign = await call("POST", "/api/teacher/tasks", t, { type: "pairs", title: "Чужой предмет", subjectId: subj("biology"), grade: 7, data });
  assert.equal(foreign.status, 403);
  assert.match(foreign.json.error, /не ведёте этот предмет/);
  assert.equal((await call("POST", "/api/teacher/tasks", t, { type: "pairs", title: "x", subjectId: 99999, data })).status, 400);

  const own = await call("POST", "/api/teacher/tasks", t, { type: "pairs", title: "Своё", subjectId: subj("algebra"), grade: 7, data });
  assert.equal(own.status, 200, JSON.stringify(own.json));
  const none = await call("POST", "/api/teacher/tasks", t, { type: "pairs", title: "Без предмета", subjectId: null, data });
  assert.equal(none.status, 200);

  const upd = await call("PUT", `/api/teacher/tasks/${own.json.id}`, t, { type: "pairs", title: "Своё", subjectId: subj("biology"), grade: 7, data });
  assert.equal(upd.status, 403);
  assert.equal((await call("GET", `/api/teacher/tasks/${own.json.id}`, t)).json.subject.id, subj("algebra"), "задание не изменилось");
  assert.equal((await call("PUT", `/api/teacher/tasks/${own.json.id}`, t, { type: "pairs", title: "Своё 2", subjectId: subj("geometry"), data })).status, 200);
});

// ── п. 19: битый JSON в базе не даёт 500 ──
test("битый JSON в попытках квиза и заданиях не роняет сводки учителя", async () => {
  const t = await login("teacher", "teacher");
  const sid = userId("student");
  const q = db.get("SELECT id FROM quiz_questions WHERE grade = 7 LIMIT 1")!.id;
  db.run(`INSERT INTO quiz_attempts (student_id, mode, date, question_ids, answers, score, total, passed, submitted_at)
    VALUES (?, 'daily', ?, ?, '{not json', 0, 1, 0, datetime('now'))`, sid, TODAY, `[${q}]`);
  db.run(`INSERT INTO quiz_attempts (student_id, mode, date, question_ids, answers, score, total, passed, submitted_at)
    VALUES (?, 'daily', ?, 'oops', '[0]', 0, 1, 0, datetime('now'))`, sid, addDaysLocal(TODAY, -1));
  db.run(`INSERT INTO quiz_attempts (student_id, mode, date, question_ids, answers, score, total, passed, submitted_at)
    VALUES (?, 'daily', ?, '{"a":1}', 'null', 0, 1, 0, datetime('now'))`, sid, addDaysLocal(TODAY, -2));
  const c7 = db.get("SELECT id FROM classes WHERE name = '7Б'")!.id;
  for (const url of ["/api/teacher/dashboard", `/api/teacher/insights?classId=${c7}`, "/api/teacher/notifications"]) {
    const r = await call("GET", url, t);
    assert.equal(r.status, 200, `${url}: ${JSON.stringify(r.json)}`);
  }
  // У ученика с битыми попытками квиз дня по-прежнему стартует
  const s = await login("student", "student");
  const start = await call("POST", "/api/student/quiz/daily", s);
  assert.equal(start.status, 200, JSON.stringify(start.json));

  const teacherId = userId("teacher");
  db.run("INSERT INTO tasks (teacher_id, type, title, data) VALUES (?, 'pairs', 'Битое', '{oops')", teacherId);
  const list = await call("GET", "/api/teacher/tasks", t);
  assert.equal(list.status, 200, JSON.stringify(list.json));
  assert.equal(list.json.tasks.find((x: any) => x.title === "Битое").size, 0);
});

function addDaysLocal(s: string, n: number) {
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

// ── п. 20: «Квиз дня» детерминирован и без гонки ──
test("квиз дня: одинаковый набор для ученика/даты/попытки, параллельный старт — одна попытка, пересдача — новые вопросы", async () => {
  const login7 = "s010";
  const sid = userId(login7);
  db.run("DELETE FROM quiz_attempts WHERE student_id = ? AND date = ?", sid, TODAY);

  // детерминированность подбора
  const a = quiz.pickDaily(sid, TODAY);
  const b = quiz.pickDaily(sid, TODAY);
  assert.ok(a.length >= 3);
  assert.deepEqual(a, b, "тот же ученик и день → те же вопросы");
  assert.deepEqual(quiz.pickDaily(sid, TODAY, 5, 1), quiz.pickDaily(sid, TODAY, 5, 1));
  assert.notDeepEqual(quiz.pickDaily(sid, TODAY, 5, 1), quiz.pickDaily(sid, TODAY, 5, 2), "другой номер попытки → другой набор");

  // параллельные запросы — одна и та же попытка
  const s = await login(login7, "student");
  const [r1, r2, r3] = await Promise.all([1, 2, 3].map(() => call("POST", "/api/student/quiz/daily", s)));
  for (const r of [r1, r2, r3]) assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r1.json.attemptId, r2.json.attemptId);
  assert.equal(r1.json.attemptId, r3.json.attemptId);
  assert.deepEqual(r1.json.questions.map((q: any) => q.id), r2.json.questions.map((q: any) => q.id));
  const open = () => Number(db.get("SELECT COUNT(*) AS n FROM quiz_attempts WHERE student_id = ? AND date = ? AND mode = 'daily' AND submitted_at IS NULL", sid, TODAY)!.n);
  assert.equal(open(), 1);
  const ids1: number[] = r1.json.questions.map((q: any) => q.id);
  assert.deepEqual(ids1, a, "в попытку попал детерминированный набор");

  // сервис: повторный старт и прямой createAttempt не создают вторую открытую попытку
  const again = quiz.startDailyQuiz(sid, TODAY);
  assert.equal(again.attemptId, r1.json.attemptId);
  assert.equal(again.resumed, true);
  assert.equal(quiz.createAttempt(sid, "daily", [1, 2, 3], null, TODAY), r1.json.attemptId);
  assert.equal(open(), 1);

  // проваленная попытка → новый квиз с другим номером попытки и другими вопросами
  const correct = new Map(db.all(`SELECT id, correct FROM quiz_questions WHERE id IN (${ids1.join(",")})`).map((r) => [r.id, r.correct]));
  const wrong = await call("POST", `/api/student/quiz/${r1.json.attemptId}/submit`, s, { answers: ids1.map((id) => (Number(correct.get(id)) + 1) % 4) });
  assert.equal(wrong.status, 200);
  assert.equal(wrong.json.passed, false);
  assert.equal(quiz.dailyAttemptNo(sid, TODAY), 2);
  const next = await call("POST", "/api/student/quiz/daily", s);
  assert.equal(next.status, 200);
  assert.notEqual(next.json.attemptId, r1.json.attemptId);
  assert.notDeepEqual(next.json.questions.map((q: any) => q.id), ids1, "пересдача — другие вопросы");
  assert.deepEqual(next.json.questions.map((q: any) => q.id), quiz.pickDaily(sid, TODAY, 5, 2), "и они тоже детерминированы");
});
