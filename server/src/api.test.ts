/**
 * Сквозные тесты API на отдельной временной базе.
 * Запуск: npm test (из корня или из server/).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import type { Server } from "node:http";

const dbFile = path.join(os.tmpdir(), `klasna-test-${process.pid}.db`);
process.env.KLASNA_DB = dbFile;
process.env.KLASNA_TODAY = "2026-11-05";
process.env.KLASNA_NOW = "10:40";
// Временная папка материалов с файлами-образцами
const matDir = path.join(os.tmpdir(), `klasna-materials-${process.pid}`);
process.env.KLASNA_MATERIALS = matDir;
const SAMPLE: Record<string, string> = {
  "Учебники/Алгебра/7/Алгебра 7.pdf": "%PDF-1.4 учебник",
  "ЕИОР — Видеоуроки/Алгебра/7/02_Умножение многочленов.mp4": "0123456789".repeat(100),
  "ЕИОР — Видеоуроки/Физика/9/Сила трения.mp4": "video",
  "Методика (profil.adu.by)/Интерактивные задания/Как создать задание.pdf": "%PDF-1.4 методичка",
  "Лингва — Аудио/Английский язык/7/Unit 3/01_Dialogue.mp3": "ID3 audio",
  "Лингва — Аудио/Английский язык/9/Listening.mp3": "ID3 audio",
  "ЕИОР — Видеоуроки/Алгебра/7/readme.txt": "не медиа — не показывается",
};
for (const [rel, body] of Object.entries(SAMPLE)) {
  fs.mkdirSync(path.dirname(path.join(matDir, rel)), { recursive: true });
  fs.writeFileSync(path.join(matDir, rel), body);
}

let server: Server;
let base = "";
let mod: {
  all: typeof import("./db.js").all;
  get: typeof import("./db.js").get;
  db: typeof import("./db.js").db;
};

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

before(async () => {
  const { migrate, all, get, db } = await import("./db.js");
  migrate();
  const { seed } = await import("./seed.js");
  seed();
  const { createApp } = await import("./app.js");
  mod = { all, get, db };
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

after(async () => {
  await new Promise((r) => server?.close(r));
  mod?.db.close();
  for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) fs.rmSync(f, { force: true });
  fs.rmSync(matDir, { recursive: true, force: true });
});

test("вход: неверный пароль, чужая роль, успешный вход", async () => {
  assert.equal((await call("POST", "/api/auth/login", undefined, { login: "teacher", password: "nope", role: "teacher" })).status, 401);
  const wrongRole = await call("POST", "/api/auth/login", undefined, { login: "teacher", password: "demo", role: "student" });
  assert.equal(wrongRole.status, 403);
  assert.match(wrongRole.json.error, /учителя/);
  const bad = await call("POST", "/api/auth/login", undefined, { login: "", password: "", role: "x" });
  assert.equal(bad.status, 400);
  const t = await login("teacher", "teacher");
  const me = await call("GET", "/api/auth/me", t);
  assert.equal(me.json.role, "teacher");
  assert.equal(me.json.className, "7Б");
});

test("без токена и с чужой ролью — доступ закрыт", async () => {
  assert.equal((await call("GET", "/api/teacher/dashboard")).status, 401);
  const s = await login("student", "student");
  assert.equal((await call("GET", "/api/teacher/dashboard", s)).status, 403);
  const t = await login("teacher", "teacher");
  assert.equal((await call("GET", "/api/student/overview", t)).status, 403);
  assert.equal((await call("GET", "/api/nope", t)).status, 404);
});

test("учитель: все разделы отвечают и данные осмысленны", async () => {
  const t = await login("teacher", "teacher");
  const dash = await call("GET", "/api/teacher/dashboard", t);
  assert.equal(dash.status, 200);
  assert.ok(dash.json.today.length > 0, "у учителя математики сегодня есть уроки");
  for (const l of dash.json.today) assert.ok(l.topic?.title, "у каждого урока есть тема");
  assert.ok(dash.json.unmarked.length >= 1, "есть демо-урок с незаполненным журналом");
  assert.ok(Array.isArray(dash.json.attention) && dash.json.attention.length <= 4, "«кому нужна помощь» — не больше 4");
  for (const a of dash.json.attention) assert.ok(a.reasons.length > 0 && a.className, "у каждого есть причина и класс");

  const classes = await call("GET", "/api/teacher/classes", t);
  assert.equal(classes.status, 200);
  const c7 = classes.json.find((c: any) => c.name === "7Б");
  assert.ok(c7?.homeroom);

  const week = await call("GET", "/api/teacher/schedule?week=2026-11-02", t);
  assert.equal(week.json.days.length, 5);
  const all = week.json.days.flatMap((d: any) => d.lessons);
  assert.ok(all.every((l: any) => l.topic), "в расписании у каждого урока тема");

  for (const url of [
    `/api/teacher/attendance?classId=${c7.id}`,
    `/api/teacher/performance?classId=${c7.id}&quarter=0`,
    `/api/teacher/performance?classId=${c7.id}&quarter=1`,
    `/api/teacher/curriculum?classId=${c7.id}&subjectId=${c7.subjects[0].id}`,
    `/api/teacher/insights?classId=${c7.id}`,
    "/api/teacher/library",
  ]) {
    const r = await call("GET", url, t);
    assert.equal(r.status, 200, `${url}: ${JSON.stringify(r.json)}`);
  }
  const att = await call("GET", `/api/teacher/attendance?classId=${c7.id}`, t);
  assert.equal(att.json.students.length, 24);
  assert.ok(att.json.summary.rate > 80 && att.json.summary.rate <= 100);
  const perf = await call("GET", `/api/teacher/performance?classId=${c7.id}&quarter=0`, t);
  assert.ok(perf.json.average >= 4 && perf.json.average <= 10);
  assert.equal(perf.json.distribution.length, 10);
});

test("учитель: чужой класс и чужой урок недоступны", async () => {
  const t = await login("zhuk", "teacher"); // физик не ведёт 5А
  const c5 = mod.get("SELECT id FROM classes WHERE name = '5А'")!;
  assert.equal((await call("GET", `/api/teacher/attendance?classId=${c5.id}`, t)).status, 403);
  const foreign = mod.get(`SELECT l.id FROM lessons l JOIN teacher_assignments ta ON ta.id = l.assignment_id JOIN users u ON u.id = ta.teacher_id WHERE u.login = 'teacher' LIMIT 1`)!;
  assert.equal((await call("GET", `/api/teacher/lessons/${foreign.id}`, t)).status, 403);
});

test("журнал: сохранение посещаемости, оценок, темы и ДЗ; валидация", async () => {
  const t = await login("teacher", "teacher");
  const dash = await call("GET", "/api/teacher/dashboard", t);
  const lesson = dash.json.unmarked[0];
  const detail = await call("GET", `/api/teacher/lessons/${lesson.id}`, t);
  assert.equal(detail.status, 200);
  assert.ok(detail.json.canMark);
  const [s1, s2] = detail.json.students;

  const bad = await call("PUT", `/api/teacher/lessons/${lesson.id}`, t, { grades: [{ studentId: s1.id, kind: "answer", value: 11 }] });
  assert.equal(bad.status, 400);

  const save = await call("PUT", `/api/teacher/lessons/${lesson.id}`, t, {
    attendance: detail.json.students.map((s: any) => ({ studentId: s.id, status: s.id === s2.id ? "absent" : "present" })),
    grades: [{ studentId: s1.id, kind: "answer", value: 9 }],
    homework: "§ 7, № 201, 204",
  });
  assert.equal(save.status, 200, JSON.stringify(save.json));
  assert.equal(save.json.presentCount, detail.json.students.length - 1);

  const again = await call("GET", `/api/teacher/lessons/${lesson.id}`, t);
  assert.ok(again.json.lesson.marked);
  assert.equal(again.json.lesson.homework, "§ 7, № 201, 204");
  assert.deepEqual(again.json.students.find((s: any) => s.id === s1.id).grades, [{ value: 9, kind: "answer" }]);

  // новая оценка другого вида заменяет предыдущую — за урок только одна
  const replace = await call("PUT", `/api/teacher/lessons/${lesson.id}`, t, {
    grades: [{ studentId: s1.id, kind: "independent", value: 8 }],
  });
  assert.equal(replace.status, 200);
  const afterReplace = await call("GET", `/api/teacher/lessons/${lesson.id}`, t);
  assert.deepEqual(afterReplace.json.students.find((s: any) => s.id === s1.id).grades, [{ value: 8, kind: "independent" }]);

  // Н снимает оценку
  const withAbsent = await call("PUT", `/api/teacher/lessons/${lesson.id}`, t, {
    attendance: [{ studentId: s1.id, status: "absent" }],
    grades: [{ studentId: s1.id, kind: "independent", value: 7 }],
  });
  assert.equal(withAbsent.status, 200);
  const afterAbsent = await call("GET", `/api/teacher/lessons/${lesson.id}`, t);
  const s1after = afterAbsent.json.students.find((s: any) => s.id === s1.id);
  assert.equal(s1after.status, "absent");
  assert.deepEqual(s1after.grades, []);

  // будущий урок: оценки ставить нельзя
  const future = mod.get(`SELECT l.id FROM lessons l JOIN teacher_assignments ta ON ta.id = l.assignment_id JOIN users u ON u.id = ta.teacher_id WHERE u.login = 'teacher' AND l.date > '2026-11-05' LIMIT 1`)!;
  const f = await call("PUT", `/api/teacher/lessons/${future.id}`, t, { grades: [{ studentId: s1.id, kind: "answer", value: 8 }] });
  assert.equal(f.status, 400);
  // тема не из программы предмета — отказ
  const otherTopic = mod.get("SELECT ct.id FROM curriculum_topics ct JOIN subjects s ON s.id = ct.subject_id WHERE s.code = 'biology' LIMIT 1")!;
  assert.equal((await call("PUT", `/api/teacher/lessons/${lesson.id}`, t, { topicId: otherTopic.id })).status, 400);

  // «следующий урок — перевёрнутый»: пометка ставится на следующий урок предмета
  assert.ok(detail.json.next, "у урока есть следующий по предмету");
  assert.equal((await call("PUT", `/api/teacher/lessons/${lesson.id}`, t, { nextFlipped: true })).status, 200);
  assert.equal((await call("GET", `/api/teacher/lessons/${lesson.id}`, t)).json.next.flipped, true);
  assert.equal((await call("GET", `/api/teacher/lessons/${detail.json.next.id}`, t)).json.lesson.flipped, true);
  await call("PUT", `/api/teacher/lessons/${lesson.id}`, t, { nextFlipped: false });
  assert.equal((await call("GET", `/api/teacher/lessons/${lesson.id}`, t)).json.next.flipped, false);
});

test("ученик: обзор, оценки, расписание, ДЗ, библиотека, перевёрнутый урок, ЦТ/ЦЭ", async () => {
  const s = await login("student", "student");
  for (const url of ["/api/student/overview", "/api/student/grades", "/api/student/grades?quarter=1", "/api/student/schedule", "/api/student/homework", "/api/student/streak", "/api/student/library"]) {
    const r = await call("GET", url, s);
    assert.equal(r.status, 200, `${url}: ${JSON.stringify(r.json)}`);
  }
  const ov = await call("GET", "/api/student/overview", s);
  assert.equal(ov.json.className, "7Б");
  assert.ok(ov.json.streak.current >= 10, "у демо-ученицы серия ≥ 10 дней");
  assert.equal(ov.json.streak.todayDone, false);
  const grades = await call("GET", "/api/student/grades", s);
  assert.ok(grades.json.subjects.length === 8);
  assert.ok(grades.json.subjects.some((x: any) => x.grades.length > 0));

  // перевёрнутый урок — пометка в домашнем задании, а не отдельная страница
  const hwList = await call("GET", "/api/student/homework", s);
  const flipHw = hwList.json.items.find((x: any) => x.flipped);
  assert.ok(flipHw, "в демо-данных есть ДЗ к перевёрнутому уроку");
  assert.ok(flipHw.newTopic?.title, "у перевёрнутого урока указана новая тема");
  assert.match(flipHw.text, /Изучите дома/);
  assert.equal((await call("GET", "/api/student/flipped", s)).status, 404);

  // подготовка к ЦТ/ЦЭ — только 10–11 классы: ученице 7Б закрыто
  assert.equal((await call("GET", "/api/student/exam", s)).status, 403);
  const s7 = s;
  const s11 = await login("student11", "student");
  const exam = await call("GET", "/api/student/exam", s11);
  assert.equal(exam.status, 200, JSON.stringify(exam.json));
  assert.equal(exam.json.stage, "exam");
  assert.equal((await call("POST", `/api/student/exam/${exam.json.subjects[0].id}`, s7, { variant: "v1" })).status, 403);
  assert.ok(exam.json.subjects.length >= 5);
  assert.ok(exam.json.variants.length >= 4);
  assert.ok(!("years" in exam.json), "никаких выдуманных «годов» у вариантов");
  const subj = exam.json.subjects[0];
  const variant = exam.json.variants[0];
  assert.equal((await call("POST", `/api/student/exam/${subj.id}`, s11, {})).status, 400, "без варианта нельзя");
  const start = await call("POST", `/api/student/exam/${subj.id}`, s11, { variant: variant.id });
  assert.equal(start.status, 200, JSON.stringify(start.json));
  assert.equal(start.json.mode, "exam");
  assert.equal(start.json.variant.id, variant.id);
  assert.ok(start.json.questions.length >= 5);
  // часть В — задания с кратким ответом в конце варианта
  const shortQs = start.json.questions.filter((q: any) => q.kind === "short");
  assert.ok(shortQs.length >= 1, "в варианте есть часть В");
  assert.deepEqual(shortQs[0].options, []);
  assert.equal(start.json.questions[start.json.questions.length - 1].kind, "short");
  // Тот же вариант → тот же набор вопросов
  const again = await call("POST", `/api/student/exam/${subj.id}`, s11, { variant: variant.id });
  assert.deepEqual(again.json.questions.map((q: any) => q.id), start.json.questions.map((q: any) => q.id));
  const other = exam.json.variants.find((v: any) => v.id !== variant.id)!;
  const otherStart = await call("POST", `/api/student/exam/${subj.id}`, s11, { variant: other.id });
  assert.equal(otherStart.status, 200);
  assert.notDeepEqual(otherStart.json.questions.map((q: any) => q.id), start.json.questions.map((q: any) => q.id));
  const ids: number[] = start.json.questions.map((q: any) => q.id);
  // правильный ответ: индекс варианта (часть А) или текст (часть В; регистр и пробелы не важны)
  const correct = new Map(mod.all(`SELECT id, correct, answer FROM quiz_questions WHERE id IN (${ids.join(",")})`)
    .map((r) => [r.id, r.answer ? ` ${String(JSON.parse(r.answer)[0]).toUpperCase()} ` : r.correct]));
  const before = (await call("GET", "/api/student/streak", s11)).json.current;
  const submitted = await call("POST", `/api/student/quiz/${start.json.attemptId}/submit`, s11, { answers: ids.map((id) => correct.get(id)) });
  assert.equal(submitted.json.score, ids.length, "все ответы, включая часть В, засчитаны");
  assert.equal(submitted.status, 200);
  assert.equal(submitted.json.passed, true);
  assert.equal(submitted.json.dayCounted, false, "тренировка ЦТ/ЦЭ не даёт день стрика");
  assert.equal((await call("GET", "/api/student/streak", s11)).json.current, before);
});

test("квиз дня: только свой класс и пройденные разделы; стрик за ≥ 60 %", async () => {
  const s = await login("student", "student");
  const before = (await call("GET", "/api/student/streak", s)).json.current;

  const start = await call("POST", "/api/student/quiz/daily", s);
  assert.equal(start.status, 200);
  assert.equal(start.json.questions.length, 5);
  assert.ok(start.json.questions.every((q: any) => !("correct" in q)), "правильный ответ не уходит на клиент");

  // Повторный запрос возвращает ту же незавершённую попытку
  const same = await call("POST", "/api/student/quiz/daily", s);
  assert.equal(same.json.attemptId, start.json.attemptId);

  const ids: number[] = start.json.questions.map((q: any) => q.id);
  const rows = mod.all(`SELECT q.id, q.grade, q.section_no, q.subject_id, q.correct FROM quiz_questions q WHERE q.id IN (${ids.join(",")})`);
  // Каждый вопрос — 7 класса и из раздела, который уже начат на уроках 7Б
  for (const q of rows) {
    assert.equal(q.grade, 7, "вопросы только для 7 класса");
    const max = mod.get(
      `SELECT MAX(ct.section_no) AS m FROM lessons l JOIN teacher_assignments ta ON ta.id = l.assignment_id JOIN classes c ON c.id = ta.class_id
        JOIN curriculum_topics ct ON ct.id = l.topic_id WHERE c.name = '7Б' AND ta.subject_id = ? AND l.date <= '2026-11-05'`, q.subject_id)!;
    assert.ok(q.section_no <= max.m, "вопрос только по пройденному разделу");
  }
  const byId = new Map(rows.map((r) => [r.id, r.correct]));

  // Неверно отвечаем — день не засчитан
  const wrong = await call("POST", `/api/student/quiz/${start.json.attemptId}/submit`, s, { answers: ids.map((id) => (Number(byId.get(id)) + 1) % 4) });
  assert.equal(wrong.status, 200);
  assert.equal(wrong.json.passed, false);
  assert.equal(wrong.json.dayCounted, false);
  assert.equal((await call("POST", `/api/student/quiz/${start.json.attemptId}/submit`, s, { answers: ids.map(() => 0) })).status, 409);

  // Новая попытка, отвечаем верно — день засчитан, стрик +1
  const s2 = await call("POST", "/api/student/quiz/daily", s);
  const ids2: number[] = s2.json.questions.map((q: any) => q.id);
  const correct2 = new Map(mod.all(`SELECT id, correct FROM quiz_questions WHERE id IN (${ids2.join(",")})`).map((r) => [r.id, r.correct]));
  const ok = await call("POST", `/api/student/quiz/${s2.json.attemptId}/submit`, s, { answers: ids2.map((id) => correct2.get(id)) });
  assert.equal(ok.json.passed, true);
  assert.equal(ok.json.dayCounted, true);
  assert.equal(ok.json.streak.current, before + 1);
  assert.equal(ok.json.streak.todayDone, true);

  // Третья успешная попытка в тот же день второй день не даёт
  const s3 = await call("POST", "/api/student/quiz/daily", s);
  const ids3: number[] = s3.json.questions.map((q: any) => q.id);
  const correct3 = new Map(mod.all(`SELECT id, correct FROM quiz_questions WHERE id IN (${ids3.join(",")})`).map((r) => [r.id, r.correct]));
  const again = await call("POST", `/api/student/quiz/${s3.json.attemptId}/submit`, s, { answers: ids3.map((id) => correct3.get(id)) });
  assert.equal(again.json.dayCounted, false);
  assert.equal(again.json.xp, 0);
  assert.equal(again.json.streak.current, before + 1);

  // Чужую попытку отправить нельзя
  const other = await login("s050", "student");
  assert.equal((await call("POST", `/api/student/quiz/${s3.json.attemptId}/submit`, other, { answers: [0, 0, 0, 0, 0] })).status, 404);
});

test("самопроверка ДЗ: 3 вопроса по предмету урока", async () => {
  const s = await login("student", "student");
  const hw = await call("GET", "/api/student/homework", s);
  const item = hw.json.items.find((i: any) => i.canCheck);
  assert.ok(item, "есть ДЗ с самопроверкой");
  const r = await call("POST", `/api/student/homework/${item.lessonId}/check`, s);
  assert.equal(r.status, 200);
  assert.ok(r.json.questions.length >= 2 && r.json.questions.length <= 3);
  for (const q of r.json.questions) assert.equal(q.subject, item.subject.name);
  // ДЗ чужого класса недоступно
  const foreign = mod.get(`SELECT l.id FROM lessons l JOIN teacher_assignments ta ON ta.id = l.assignment_id JOIN classes c ON c.id = ta.class_id WHERE c.name = '9А' AND l.homework IS NOT NULL LIMIT 1`)!;
  assert.equal((await call("POST", `/api/student/homework/${foreign.id}/check`, s)).status, 404);
  assert.equal((await call("PUT", `/api/student/homework/${item.lessonId}`, s, { done: true })).status, 200);
});

test("банк вопросов согласован с программой классов", () => {
  const bad = mod.all(`
    SELECT q.id, q.grade, q.section_no FROM quiz_questions q
     WHERE NOT EXISTS (SELECT 1 FROM curriculum_topics ct WHERE ct.subject_id = q.subject_id AND ct.grade = q.grade AND ct.section_no = q.section_no)`);
  assert.equal(bad.length, 0, `вопросы вне программы: ${JSON.stringify(bad)}`);
  const noTopic = mod.get("SELECT COUNT(*) AS n FROM lessons WHERE topic_id IS NULL")!;
  assert.equal(noTopic.n, 0, "у каждого урока есть тема");
  const clash = mod.get(`SELECT COUNT(*) AS n FROM (SELECT ta.teacher_id, ss.weekday, ss.lesson_no FROM schedule_slots ss JOIN teacher_assignments ta ON ta.id = ss.assignment_id GROUP BY 1,2,3 HAVING COUNT(*) > 1)`)!;
  assert.equal(clash.n, 0, "у учителей нет накладок в расписании");
});

/* ───────────── Регистрация, уведомления, поиск, карточка ученика, экспорт ───────────── */

async function raw(url: string, token: string) {
  const res = await fetch(base + url, { headers: { Authorization: `Bearer ${token}` } });
  return {
    status: res.status,
    type: res.headers.get("content-type") ?? "",
    disposition: res.headers.get("content-disposition") ?? "",
    bytes: new Uint8Array(await res.arrayBuffer()),
  };
}

test("регистрация: варианты для формы", async () => {
  const r = await call("GET", "/api/auth/register/options");
  assert.equal(r.status, 200);
  const g7 = r.json.grades.find((g: any) => g.grade === 7);
  assert.deepEqual(r.json.grades.map((g: any) => g.grade), [5, 6, 7, 8, 9, 10, 11]);
  assert.ok(g7, "есть программы для 7 класса");
  const codes = g7.subjects.map((s: any) => s.code);
  assert.ok(codes.includes("algebra") && codes.includes("physics"));
  assert.equal(r.json.demoSchoolCode, "SCH12-2026");
});

test("регистрация учителей 6 и 8 классов с созданием расписания", async () => {
  for (const grade of [6, 8]) {
    const options = await call("GET", "/api/auth/register/options");
    const subjects = options.json.grades.find((g: any) => g.grade === grade).subjects;
    assert.ok(subjects.some((s: any) => s.code === (grade === 8 ? "algebra" : "math")));
    const reg = await call("POST", "/api/auth/register", undefined, {
      role: "teacher", fullName: "Петрова Анна Ивановна", login: `teacher.grade${grade}`,
      password: "secret11", schoolCode: "SCH12-2026", grade, letter: "В", subjects: [grade === 8 ? "algebra" : "math"],
    });
    assert.equal(reg.status, 200, JSON.stringify(reg.json));
    assert.equal(reg.json.user.grade, grade);
    assert.equal(reg.json.user.className, `${grade}В`);
    const assignment = mod.get("SELECT id FROM teacher_assignments WHERE teacher_id = ?", reg.json.user.id)!;
    assert.ok(assignment);
    assert.ok(mod.get("SELECT id FROM schedule_slots WHERE assignment_id = ?", assignment.id));
    assert.ok(mod.get("SELECT id FROM lessons WHERE assignment_id = ? AND topic_id IS NOT NULL", assignment.id));
  }
});

test("программы 6 и 8 классов: обновление существующей базы сохраняет назначенные темы", async () => {
  const { syncExtraCurricula } = await import("./services/curriculum-sync.js");
  const lesson = mod.get(`SELECT l.id, l.topic_id FROM lessons l
    JOIN teacher_assignments ta ON ta.id = l.assignment_id JOIN classes c ON c.id = ta.class_id
    WHERE c.grade = 8 AND l.topic_id IS NOT NULL ORDER BY l.date, l.lesson_no LIMIT 1`)!;
  const before = mod.get("SELECT COUNT(*) AS n FROM curriculum_topics")!.n;
  mod.db.prepare("UPDATE lessons SET topic_id = NULL WHERE id = ?").run(lesson.id);
  syncExtraCurricula();
  assert.equal(mod.get("SELECT topic_id FROM lessons WHERE id = ?", lesson.id)!.topic_id, lesson.topic_id);
  syncExtraCurricula();
  assert.equal(mod.get("SELECT COUNT(*) AS n FROM curriculum_topics")!.n, before);
  assert.equal(mod.get("SELECT topic_id FROM lessons WHERE id = ?", lesson.id)!.topic_id, lesson.topic_id);
});

test("регистрация ученика по коду класса → вход и обзор своего класса", async () => {
  const cls = mod.get("SELECT id, name, join_code FROM classes WHERE name = '5А'")!;
  assert.ok(cls.join_code, "у класса есть код для входа");
  const reg = await call("POST", "/api/auth/register", undefined, {
    role: "student", fullName: "  иванова   мария  ", login: "Masha.Ivanova", password: "secret11", classCode: ` ${String(cls.join_code).toLowerCase()} `,
  });
  assert.equal(reg.status, 200, JSON.stringify(reg.json));
  assert.ok(reg.json.token);
  assert.equal(reg.json.user.role, "student");
  assert.equal(reg.json.user.login, "masha.ivanova", "логин приводится к нижнему регистру");
  assert.equal(reg.json.user.fullName, "Иванова Мария", "ФИО нормализуется");
  assert.equal(reg.json.user.className, cls.name);

  const li = await call("POST", "/api/auth/login", undefined, { login: "masha.ivanova", password: "secret11", role: "student" });
  assert.equal(li.status, 200, JSON.stringify(li.json));
  const ov = await call("GET", "/api/student/overview", li.json.token);
  assert.equal(ov.status, 200, JSON.stringify(ov.json));
  assert.equal(ov.json.className, cls.name);
  assert.equal(ov.json.streak.current, 0, "у нового ученика серия с нуля");
  for (const url of ["/api/student/grades", "/api/student/schedule", "/api/student/homework", "/api/student/streak"]) {
    const r = await call("GET", url, li.json.token);
    assert.equal(r.status, 200, `${url}: ${JSON.stringify(r.json)}`);
  }
  // Учитель класса видит нового ученика
  const t = await login("teacher", "teacher");
  const att = await call("GET", `/api/teacher/attendance?classId=${cls.id}`, t);
  assert.ok(att.json.students.some((s: any) => s.id === reg.json.user.id));
});

test("регистрация ученика: неверный код, занятый логин, короткий пароль", async () => {
  const code = mod.get("SELECT join_code FROM classes WHERE name = '5А'")!.join_code;
  const body = { role: "student", fullName: "Петров Пётр", password: "secret11" };
  const wrong = await call("POST", "/api/auth/register", undefined, { ...body, login: "petrov.p", classCode: "ZZ-0000" });
  assert.equal(wrong.status, 404);
  assert.match(wrong.json.error, /код/i);
  const dup = await call("POST", "/api/auth/register", undefined, { ...body, login: "teacher", classCode: code });
  assert.equal(dup.status, 409);
  assert.match(dup.json.error, /занят/);
  const dupCase = await call("POST", "/api/auth/register", undefined, { ...body, login: "Student", classCode: code });
  assert.equal(dupCase.status, 409, "занятость логина не зависит от регистра");
  const short = await call("POST", "/api/auth/register", undefined, { ...body, login: "petrov.p", password: "123", classCode: code });
  assert.equal(short.status, 400);
  assert.ok(short.json.error, "есть текст ошибки");
  assert.ok(short.json.details.includes("Пароль — минимум 8 символов"), JSON.stringify(short.json));
  // 8+ символов, но без цифры или без буквы — тоже нельзя
  const noDigit = await call("POST", "/api/auth/register", undefined, { ...body, login: "petrov.p", password: "abcdefgh", classCode: code });
  assert.equal(noDigit.status, 400);
  assert.ok(noDigit.json.details.includes("В пароле нужна хотя бы одна цифра"), JSON.stringify(noDigit.json));
  const noLetter = await call("POST", "/api/auth/register", undefined, { ...body, login: "petrov.p", password: "12345678", classCode: code });
  assert.equal(noLetter.status, 400);
  assert.ok(noLetter.json.details.includes("В пароле нужна хотя бы одна буква"), JSON.stringify(noLetter.json));
  const badLogin = await call("POST", "/api/auth/register", undefined, { ...body, login: "пётр", classCode: code });
  assert.equal(badLogin.status, 400);
  // Неудачные попытки не создали пользователя
  assert.equal(mod.get("SELECT COUNT(*) AS n FROM users WHERE login = 'petrov.p'")!.n, 0);
});

test("регистрация учителя: свой класс, расписание с темами, код класса", async () => {
  const reg = await call("POST", "/api/auth/register", undefined, {
    role: "teacher", fullName: "Сидоренко Анна Олеговна", login: "sidorenko", password: "secret12",
    schoolCode: "sch12-2026", grade: 7, letter: "в", subjects: ["algebra", "physics", "algebra"],
  });
  assert.equal(reg.status, 200, JSON.stringify(reg.json));
  assert.equal(reg.json.user.role, "teacher");
  assert.equal(reg.json.user.className, "7В");
  assert.match(reg.json.user.joinCode, /^7V-[A-Z2-9]{4}$/);
  const t = reg.json.token as string;

  const classes = await call("GET", "/api/teacher/classes", t);
  assert.equal(classes.status, 200);
  assert.equal(classes.json.length, 1);
  const c = classes.json[0];
  assert.equal(c.name, "7В");
  assert.equal(c.homeroom, true);
  assert.equal(c.joinCode, reg.json.user.joinCode);
  assert.deepEqual(c.subjects.map((s: any) => s.code).sort(), ["algebra", "physics"]);

  // Текущая неделя: уроки только с дня регистрации (прошлые не создаются — журнал за них не «висит»)
  const cur = await call("GET", "/api/teacher/schedule", t);
  assert.equal(cur.status, 200);
  const curLessons = cur.json.days.flatMap((d: any) => d.lessons);
  assert.ok(curLessons.length > 0, "уроки появляются сразу, на этой же неделе");
  assert.ok(curLessons.every((l: any) => l.date >= "2026-11-05" && l.topic?.title));
  assert.equal(mod.get(`SELECT COUNT(*) AS n FROM lessons l JOIN teacher_assignments ta ON ta.id = l.assignment_id JOIN classes c ON c.id = ta.class_id WHERE c.name = '7В' AND l.date < '2026-11-05'`)!.n, 0);
  const notif = await call("GET", "/api/teacher/notifications", t);
  assert.ok(!notif.json.items.some((n: any) => n.kind === "journal"), "у нового учителя нет «незаполненного журнала» за прошлое");

  // Полная неделя: алгебра 3 ч + физика 2 ч, у каждого урока тема из программы
  const week = await call("GET", "/api/teacher/schedule?week=2026-11-09", t);
  assert.equal(week.status, 200);
  const lessons = week.json.days.flatMap((d: any) => d.lessons);
  assert.equal(lessons.length, 5, `уроков на неделе: ${lessons.length}`);
  assert.ok(lessons.every((l: any) => l.topic?.title), "у каждого урока есть тема из программы");
  assert.ok(lessons.every((l: any) => l.className === "7В"));
  assert.equal(lessons.filter((l: any) => l.subject.code === "algebra").length, 3);
  assert.equal(lessons.filter((l: any) => l.subject.code === "physics").length, 2);
  // Позиция в программе — как если бы класс учился с 1 сентября: не первая тема
  const firstTopic = mod.get("SELECT ct.id FROM curriculum_topics ct JOIN subjects s ON s.id = ct.subject_id WHERE s.code = 'algebra' AND ct.grade = 7 ORDER BY ct.seq LIMIT 1")!;
  assert.ok(lessons.every((l: any) => l.topic.id !== firstTopic.id));

  // В базе: ни одного урока без темы и никаких накладок в расписании класса
  const noTopic = mod.get(`SELECT COUNT(*) AS n FROM lessons l JOIN teacher_assignments ta ON ta.id = l.assignment_id JOIN classes c ON c.id = ta.class_id WHERE c.name = '7В' AND l.topic_id IS NULL`)!;
  assert.equal(noTopic.n, 0);
  const clash = mod.get(`SELECT COUNT(*) AS n FROM (SELECT ss.weekday, ss.lesson_no FROM schedule_slots ss JOIN teacher_assignments ta ON ta.id = ss.assignment_id JOIN classes c ON c.id = ta.class_id WHERE c.name = '7В' GROUP BY 1, 2 HAVING COUNT(*) > 1)`)!;
  assert.equal(clash.n, 0);

  // По коду нового класса может зарегистрироваться ученик
  const st = await call("POST", "/api/auth/register", undefined, { role: "student", fullName: "Орлов Илья", login: "orlov", password: "secret11", classCode: c.joinCode });
  assert.equal(st.status, 200, JSON.stringify(st.json));
  assert.equal(st.json.user.className, "7В");
  const ov = await call("GET", "/api/student/overview", st.json.token);
  assert.equal(ov.status, 200, JSON.stringify(ov.json));
});

test("регистрация учителя: неверный код школы, занятый класс, валидация", async () => {
  const body = { role: "teacher", fullName: "Кузьмич Олег Иванович", login: "kuzmich", password: "secret12", grade: 7, subjects: ["algebra"] };
  const wrongCode = await call("POST", "/api/auth/register", undefined, { ...body, schoolCode: "SCH99-0000", letter: "Г" });
  assert.equal(wrongCode.status, 403);
  assert.match(wrongCode.json.error, /код школы/i);
  const taken = await call("POST", "/api/auth/register", undefined, { ...body, schoolCode: "SCH12-2026", letter: "Б" });
  assert.equal(taken.status, 409);
  assert.match(taken.json.error, /7Б/);
  const latin = await call("POST", "/api/auth/register", undefined, { ...body, schoolCode: "SCH12-2026", letter: "B" });
  assert.equal(latin.status, 400, "буква класса — только кириллица");
  const noGrade = await call("POST", "/api/auth/register", undefined, { ...body, schoolCode: "SCH12-2026", letter: "Г", grade: 12 });
  assert.equal(noGrade.status, 400);
  const noSubjects = await call("POST", "/api/auth/register", undefined, { ...body, schoolCode: "SCH12-2026", letter: "Г", subjects: ["astrology"] });
  assert.equal(noSubjects.status, 400);
  // Ни одна неудачная попытка не оставила следов
  assert.equal(mod.get("SELECT COUNT(*) AS n FROM users WHERE login = 'kuzmich'")!.n, 0);
  assert.equal(mod.get("SELECT COUNT(*) AS n FROM classes WHERE name = '7Г'")!.n, 0);
});

test("учитель: уведомления", async () => {
  const t = await login("teacher", "teacher");
  const r = await call("GET", "/api/teacher/notifications", t);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.ok(Array.isArray(r.json.items));
  assert.ok(r.json.items.length > 0, "у учителя математики есть уведомления");
  for (const n of r.json.items) {
    assert.ok(n.id && n.title && n.text, JSON.stringify(n));
    assert.match(n.link, /^\/t\//);
    assert.ok(["red", "amber", "blue"].includes(n.tone));
  }
  assert.equal(new Set(r.json.items.map((n: any) => n.id)).size, r.json.items.length, "id уведомлений уникальны");
  const s = await login("student", "student");
  assert.equal((await call("GET", "/api/teacher/notifications", s)).status, 403);
});

test("учитель: поиск учеников и тем", async () => {
  const t = await login("teacher", "teacher");
  const r = await call("GET", `/api/teacher/search?q=${encodeURIComponent("ковал")}`, t);
  assert.equal(r.status, 200);
  assert.ok(r.json.students.length > 0, "кириллица ищется без учёта регистра");
  for (const s of r.json.students) assert.match(s.fullName.toLowerCase(), /ковал/);
  assert.ok(r.json.students.every((s: any) => s.id && s.className));
  assert.ok(Array.isArray(r.json.topics));
  const short = await call("GET", `/api/teacher/search?q=${encodeURIComponent("к")}`, t);
  assert.deepEqual(short.json, { students: [], topics: [] }, "одна буква — пустой ответ");
  // Физик видит только учеников своих классов (не ведёт 5А)
  const zhuk = await login("zhuk", "teacher");
  const z = await call("GET", `/api/teacher/search?q=${encodeURIComponent("ов")}`, zhuk);
  assert.ok(z.json.students.length > 0);
  assert.ok(z.json.students.every((s: any) => s.className !== "5А"));
});

test("учитель: карточка ученика — свой 200, чужой класс 403", async () => {
  const t = await login("teacher", "teacher");
  const own = mod.get("SELECT u.id FROM users u JOIN class_students cs ON cs.student_id = u.id JOIN classes c ON c.id = cs.class_id WHERE c.name = '7Б' LIMIT 1")!;
  const r = await call("GET", `/api/teacher/students/${own.id}`, t);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.className, "7Б");
  assert.equal(r.json.homeroom, true);
  assert.ok(r.json.subjects.length >= 8, "классный руководитель видит все предметы класса");

  const zhuk = await login("zhuk", "teacher");
  const foreign = mod.get("SELECT u.id FROM users u JOIN class_students cs ON cs.student_id = u.id JOIN classes c ON c.id = cs.class_id WHERE c.name = '5А' LIMIT 1")!;
  assert.equal((await call("GET", `/api/teacher/students/${foreign.id}`, zhuk)).status, 403);
  // Не классный руководитель видит только свой предмет
  const mine = await call("GET", `/api/teacher/students/${own.id}`, zhuk);
  assert.equal(mine.status, 200);
  assert.equal(mine.json.homeroom, false);
  assert.deepEqual(mine.json.subjects.map((s: any) => s.name), ["Физика"]);

  assert.equal((await call("GET", "/api/teacher/students/999999", t)).status, 404);
  assert.equal((await call("GET", "/api/teacher/students/abc", t)).status, 400);
  const teacherId = mod.get("SELECT id FROM users WHERE login = 'novik'")!.id;
  assert.equal((await call("GET", `/api/teacher/students/${teacherId}`, t)).status, 404, "учитель — не ученик");
});

test("учитель: экспорт в CSV для Excel (UTF-8 с BOM, точка с запятой)", async () => {
  const t = await login("teacher", "teacher");
  const c7 = mod.get("SELECT id FROM classes WHERE name = '7Б'")!;
  const att = await raw(`/api/teacher/export/attendance.csv?classId=${c7.id}`, t);
  assert.equal(att.status, 200);
  assert.match(att.type, /^text\/csv/);
  assert.match(att.type, /charset=utf-8/i);
  assert.match(att.disposition, /attachment/);
  assert.deepEqual([...att.bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], "файл начинается с BOM");
  const attText = new TextDecoder("utf-8", { ignoreBOM: true }).decode(att.bytes);
  const attLines = attText.slice(1).split("\r\n");
  assert.ok(attLines.length >= 2 + 24, `посещаемость: строк ${attLines.length}`);
  assert.ok(attLines[1].startsWith("Ученик;"), attLines[1]);

  const grades = await raw(`/api/teacher/export/grades.csv?classId=${c7.id}&quarter=0`, t);
  assert.equal(grades.status, 200);
  assert.deepEqual([...grades.bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], "успеваемость: BOM");
  const gText = new TextDecoder("utf-8", { ignoreBOM: true }).decode(grades.bytes);
  const gLines = gText.slice(1).split("\r\n");
  assert.ok(gLines[0].startsWith("Успеваемость 7Б;"), gLines[0]);
  assert.equal(gLines[2], "Средние баллы");
  assert.ok(gLines[3].startsWith("№;Ученик;"), gLines[3]);
  assert.ok(gLines[3].endsWith(";Средний балл"), gLines[3]);
  assert.ok(gLines[4].startsWith("1;"), `первая строка ученика: ${gLines[4]}`);
  const detailAt = gLines.indexOf("Оценки по предметам");
  assert.ok(detailAt > 4, "есть блок детальных оценок");
  assert.equal(gLines[detailAt + 1], "Ученик;Предмет;Оценок;Средний;Оценки");
  const markCells = gLines.slice(detailAt + 2).filter(Boolean).map((line) => line.split(";").pop()!);
  assert.ok(markCells.some((c) => c.includes('="')), "оценки как текстовая формула Excel");
  assert.ok(markCells.every((c) => !c || c.startsWith('"=""') || c.startsWith('="')), `оценки не должны быть голыми числами через пробел: ${markCells.find((c) => c && !c.includes("="))}`);

  const zhuk = await login("zhuk", "teacher");
  const c5 = mod.get("SELECT id FROM classes WHERE name = '5А'")!;
  assert.equal((await raw(`/api/teacher/export/attendance.csv?classId=${c5.id}`, zhuk)).status, 403);
  assert.equal((await raw(`/api/teacher/export/grades.csv?classId=${c5.id}`, zhuk)).status, 403);
});

test("материалы: разделы из папки materials, файлы отдаются сайтом, внешних ссылок нет", async () => {
  const t = await login("teacher", "teacher");
  const sum = await call("GET", "/api/teacher/materials", t);
  const count = Object.fromEntries(sum.json.sections.map((x: any) => [x.key, x.count]));
  assert.deepEqual(count, { textbooks: 1, video: 2, methods: 1, audio: 2 });

  const video = await call("GET", "/api/teacher/materials/video", t);
  const v = video.json.items.find((x: any) => x.subject?.code === "algebra");
  assert.equal(v.title, "Умножение многочленов", "номер в начале имени убирается");
  assert.equal(v.grade, 7);
  assert.equal(v.kind, "video");
  assert.ok(video.json.items.every((x: any) => x.ext !== "txt"), "не-медиа файлы не показываются");
  assert.ok(video.json.mine.subjects.includes("algebra"));
  assert.equal((await call("GET", "/api/teacher/materials/nope", t)).status, 400);

  const audio = await call("GET", "/api/teacher/materials/audio", t);
  const a = audio.json.items.find((x: any) => x.grade === 7);
  assert.equal(a.category, "Unit 3");
  assert.equal(a.subject.name, "Английский язык");

  const methods = await call("GET", "/api/teacher/materials/methods", t);
  assert.equal(methods.json.items[0].category, "Интерактивные задания");

  // Файл отдаётся с нашего сервера только вошедшим, видео — с поддержкой перемотки (Range)
  const auth = { Authorization: `Bearer ${t}` };
  assert.equal((await fetch(base + v.url)).status, 401, "без входа файлы не отдаются");
  assert.equal((await fetch(base + v.url + "?token=broken")).status, 401, "с поддельным токеном — тоже");
  const file = await fetch(base + v.url, { headers: auth });
  assert.equal(file.status, 200);
  assert.match(file.headers.get("cache-control") ?? "", /private/, "общие прокси не кэшируют закрытые файлы");
  assert.equal((await fetch(base + v.url + "?token=" + encodeURIComponent(t))).status, 200, "токен в ?token= — для <video>/<img>/<iframe>");
  const ranged = await fetch(base + v.url + "?token=" + encodeURIComponent(t), { headers: { Range: "bytes=0-9" } });
  assert.equal(ranged.status, 206);
  assert.equal(await ranged.text(), "0123456789");
  assert.equal((await fetch(base + "/materials/..%2F..%2Fpackage.json", { headers: auth })).status, 404);
  assert.equal((await fetch(base + "/materials/" + encodeURIComponent("Учебники"), { headers: auth })).status, 404, "листинга папок нет");
  assert.equal((await call("GET", "/api/teacher/materials?token=" + encodeURIComponent(t))).status, 401, "?token= не работает для /api");

  // Учебники используют ссылки каталога; урок получает материалы своего предмета и класса
  const lib = await call("GET", "/api/teacher/library", t);
  const alg7 = lib.json.textbooks.find((b: any) => b.subject_code === "algebra" && b.grade === 7);
  assert.match(alg7.url, /^https:\/\/e-padruchnik\.adu\.by\//);
  assert.ok(lib.json.textbooks.find((b: any) => b.subject_code === "algebra" && b.grade === 9).url);
  assert.ok(lib.json.textbooks.filter((b: any) => b.grade >= 10).every((b: any) => b.url === null && b.parts.length === 0));
  assert.equal(lib.json.textbooks.find((b: any) => b.key === "english-7").parts.length, 0);
  assert.equal(lib.json.textbooks.find((b: any) => b.key === "math-5").parts.length, 2);
  // Каталог учебников 5–11 классов, включая предметы вне журнала
  assert.deepEqual([...new Set(lib.json.textbooks.map((b: any) => b.grade))], [5, 6, 7, 8, 9, 10, 11]);
  assert.ok(lib.json.textbooks.some((b: any) => b.subject_code === "chemistry" && b.grade === 11));
  assert.ok(lib.json.textbooks.some((b: any) => b.subject_code === "drafting" && b.grade === 10));
  assert.ok(!lib.json.textbooks.some((b: any) => b.subject_code === "drafting" && b.grade !== 10), "черчение только в 10");
  assert.ok(lib.json.textbooks.some((b: any) => b.subject_code === "astronomy" && b.grade === 11));
  assert.ok(!lib.json.textbooks.some((b: any) => b.subject_code === "astronomy" && b.grade !== 11), "астрономия только в 11");
  assert.ok(!lib.json.textbooks.some((b: any) => b.subject_code === "algebra" && b.grade === 5), "алгебры в 5 классе нет");
  assert.ok(lib.json.mine.subjects.includes("algebra") && lib.json.mine.grades.includes(7));
  const lessonId = mod.get(
    `SELECT l.id FROM lessons l JOIN teacher_assignments ta ON ta.id = l.assignment_id JOIN subjects s ON s.id = ta.subject_id
      JOIN classes c ON c.id = ta.class_id JOIN users u ON u.id = ta.teacher_id
     WHERE u.login = 'teacher' AND s.code = 'algebra' AND c.grade = 7 LIMIT 1`,
  )!.id;
  const lesson = await call("GET", `/api/teacher/lessons/${lessonId}`, t);
  assert.equal(lesson.status, 200, JSON.stringify(lesson.json));
  assert.equal(lesson.json.textbook.url, alg7.url);
  assert.deepEqual(lesson.json.materials.map((m: any) => m.title).sort(), ["Умножение многочленов"]);
  for (const body of [video.json, audio.json]) {
    assert.doesNotMatch(JSON.stringify(body), /https?:\/\//, "в ответах API нет ссылок на сторонние сайты");
  }

  // Ученик видит только свой класс
  const s = await login("student", "student");
  const slib = await call("GET", "/api/student/library", s);
  assert.ok(slib.json.textbooks.length >= 10 && slib.json.textbooks.every((b: any) => b.grade === 7), "ученик видит учебники своего класса");
  const sv = await call("GET", "/api/student/materials/video", s);
  assert.deepEqual(sv.json.items.map((x: any) => x.grade), [7]);
  const sa = await call("GET", "/api/student/materials/audio", s);
  assert.deepEqual(sa.json.items.map((x: any) => x.grade), [7]);
  assert.equal((await call("GET", "/api/student/materials/methods", s)).status, 400);
});

test("конструктор заданий: демо, создание всех типов, проверка, правка, копия, удаление, чужие недоступны", async () => {
  const t = await login("teacher", "teacher");
  const list = await call("GET", "/api/teacher/tasks", t);
  assert.equal(list.status, 200);
  assert.equal(list.json.tasks.length, 5, "у демо-учителя 5 демо-заданий");
  assert.deepEqual(new Set(list.json.tasks.map((x: any) => x.type)), new Set(["choice", "pairs", "gaps", "order", "groups"]));
  assert.ok(list.json.mine.subjectIds.length > 0);
  const algebra = list.json.subjects.find((x: any) => x.name === "Алгебра").id;

  const bodies: Record<string, unknown> = {
    choice: { questions: [{ q: "2 + 2?", options: ["3", "4"], correct: [1] }] },
    pairs: { pairs: [{ a: "a", b: "b" }, { a: "c", b: "d" }] },
    gaps: { text: "Столица Беларуси — [Минск]." },
    order: { items: ["1", "2", "3"] },
    groups: { groups: [{ name: "А", items: ["x"] }, { name: "Б", items: ["y"] }] },
  };
  const ids: number[] = [];
  for (const [type, data] of Object.entries(bodies)) {
    const r = await call("POST", "/api/teacher/tasks", t, { type, title: `Тест ${type}`, subjectId: algebra, grade: 7, data });
    assert.equal(r.status, 200, `${type}: ${JSON.stringify(r.json)}`);
    assert.equal(r.json.subject.name, "Алгебра");
    ids.push(r.json.id);
  }

  // Ошибки понятны и указывают место
  const noCorrect = await call("POST", "/api/teacher/tasks", t, { type: "choice", title: "x", data: { questions: [{ q: "a", options: ["1", "2"], correct: [] }] } });
  assert.equal(noCorrect.status, 400);
  assert.match(noCorrect.json.details[0], /^Вопрос 1: Отметьте хотя бы один верный ответ/);
  const noGap = await call("POST", "/api/teacher/tasks", t, { type: "gaps", title: "x", data: { text: "без пропусков" } });
  assert.match(noGap.json.details[0], /квадратных скобках/);
  const emptyPair = await call("POST", "/api/teacher/tasks", t, { type: "pairs", title: "x", data: { pairs: [{ a: "1", b: "" }, { a: "2", b: "3" }] } });
  assert.match(emptyPair.json.details[0], /^Пара 1: /);
  assert.equal((await call("POST", "/api/teacher/tasks", t, { type: "magic", title: "x", data: {} })).status, 400);

  const upd = await call("PUT", `/api/teacher/tasks/${ids[0]}`, t, { type: "choice", title: "Новое название", subjectId: null, grade: null, data: bodies.choice });
  assert.equal(upd.json.title, "Новое название");
  assert.equal(upd.json.subject, null);
  const copy = await call("POST", `/api/teacher/tasks/${ids[0]}/copy`, t);
  assert.equal(copy.json.title, "Новое название (копия)");
  assert.equal((await call("DELETE", `/api/teacher/tasks/${copy.json.id}`, t)).status, 200);
  assert.equal((await call("GET", `/api/teacher/tasks/${copy.json.id}`, t)).status, 404);

  // Другой учитель и ученик не видят чужие задания
  const other = await login("zhuk", "teacher");
  assert.equal((await call("GET", `/api/teacher/tasks/${ids[1]}`, other)).status, 403);
  assert.equal((await call("DELETE", `/api/teacher/tasks/${ids[1]}`, other)).status, 403);
  assert.equal((await call("GET", "/api/teacher/tasks", other)).json.tasks.length, 0);
  const s = await login("student", "student");
  assert.equal((await call("GET", "/api/teacher/tasks", s)).status, 403);

  // Назначение классу → ученик выполняет → учитель видит результат
  const classes = await call("GET", "/api/teacher/classes", t);
  const cls7 = classes.json.find((c: any) => c.name === "7Б");
  assert.ok(cls7, "есть класс 7Б");
  const taskId = list.json.tasks.find((x: any) => x.type === "pairs")?.id ?? ids[1];
  const assigned = await call("POST", `/api/teacher/tasks/${taskId}/assign`, t, { classId: cls7.id, note: "к пятнице" });
  assert.equal(assigned.status, 200, JSON.stringify(assigned.json));
  assert.equal(assigned.json.class.name, "7Б");
  const studentTasks = await call("GET", "/api/student/tasks", s);
  assert.equal(studentTasks.status, 200);
  assert.ok(studentTasks.json.items.some((x: any) => x.id === assigned.json.id));
  const play = await call("GET", `/api/student/tasks/${assigned.json.id}`, s);
  assert.equal(play.status, 200);
  assert.ok(play.json.data);
  const submit = await call("POST", `/api/student/tasks/${assigned.json.id}/submit`, s, { score: 4, total: 5 });
  assert.equal(submit.status, 200);
  assert.equal(submit.json.done, true);
  const results = await call("GET", `/api/teacher/tasks/assignments/${assigned.json.id}/results`, t);
  assert.equal(results.status, 200);
  const me = results.json.students.find((x: any) => x.score === 4);
  assert.ok(me, "результат ученика виден учителю");
});

test("10 и 11 классы: учитель регистрирует класс, ученик входит по коду, у уроков есть темы", async () => {
  for (const [grade, subject] of [[10, "algebra"], [11, "physics"]] as const) {
    const options = await call("GET", "/api/auth/register/options");
    const g = options.json.grades.find((x: any) => x.grade === grade);
    assert.ok(g, `есть программы ${grade} класса`);
    assert.deepEqual(g.subjects.map((x: any) => x.code).sort(), ["algebra", "belarusian", "biology", "english", "geometry", "history_by", "physics", "russian"]);
    const reg = await call("POST", "/api/auth/register", undefined, {
      role: "teacher", fullName: "Сидорова Мария Петровна", login: `senior.${grade}`,
      password: "secret11", schoolCode: "SCH12-2026", grade, letter: "В", subjects: [subject],
    });
    assert.equal(reg.status, 200, JSON.stringify(reg.json));
    assert.equal(reg.json.user.className, `${grade}В`);
    const asg = mod.get("SELECT id FROM teacher_assignments WHERE teacher_id = ?", reg.json.user.id)!;
    assert.ok(mod.get("SELECT id FROM lessons WHERE assignment_id = ? AND topic_id IS NOT NULL", asg.id), "уроки получили темы программы");

    const code = mod.get("SELECT join_code FROM classes WHERE name = ?", `${grade}В`)!.join_code;
    const st = await call("POST", "/api/auth/register", undefined, {
      role: "student", fullName: "Новиков Иван Сергеевич", login: `pupil.${grade}`, password: "secret11", classCode: code,
    });
    assert.equal(st.status, 200, JSON.stringify(st.json));
    assert.equal(st.json.user.grade, grade);
    const ov = await call("GET", "/api/student/overview", st.json.token);
    assert.equal(ov.status, 200);
    const lib = await call("GET", "/api/student/library", st.json.token);
    assert.ok(lib.json.textbooks.some((b: any) => b.subject_code === "chemistry"), `в ${grade} классе есть химия на полке`);

    // ЦТ/ЦЭ доступна с 10 класса; 10-й тренируется по банку 11-го (своих вопросов нет)
    const exam = await call("GET", "/api/student/exam", st.json.token);
    assert.equal(exam.status, 200, JSON.stringify(exam.json));
    assert.equal(exam.json.stage, grade >= 11 ? "exam" : "pre");
    if (grade === 10 && exam.json.subjects.length) {
      const start = await call("POST", `/api/student/exam/${exam.json.subjects[0].id}`, st.json.token, { variant: "v1" });
      assert.equal(start.status, 200, `ЦТ/ЦЭ стартует в 10: ${JSON.stringify(start.json)}`);
      assert.ok(start.json.questions.length >= 5);
    }
  }
});

test("профиль: фото, витрина достижений, рамки за отметки, фоны за задания, карточка одноклассника", async () => {
  const s = await login("student", "student");
  const p = await call("GET", "/api/profile", s);
  assert.equal(p.status, 200);
  assert.ok(p.json.achievements.length >= 15, "много достижений");
  assert.ok(p.json.frames.length >= 8, "много рамок");
  assert.ok(p.json.backgrounds.length >= 6, "фоны профиля");
  assert.ok(!p.json.achievements.some((a: any) => a.id.startsWith("exam")), "достижения ЦТ/ЦЭ — только 10–11 классам");

  // фото: только картинка data URL
  assert.equal((await call("PUT", "/api/profile", s, { avatar: "javascript:alert(1)" })).status, 400);
  const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  assert.equal((await call("PUT", "/api/profile", s, { avatar: png })).status, 200);
  assert.equal((await call("GET", "/api/auth/me", s)).json.avatar, png);

  // витрина: только полученные достижения, не больше трёх
  const earned = p.json.achievements.filter((b: any) => b.earned).map((b: any) => b.id);
  const locked = p.json.achievements.filter((b: any) => !b.earned).map((b: any) => b.id);
  assert.ok(earned.length >= 2, "у демо-ученицы есть достижения");
  assert.equal((await call("PUT", "/api/profile", s, { showcase: [locked[0]] })).status, 400);
  assert.equal((await call("PUT", "/api/profile", s, { showcase: [...earned, ...earned, "x", "y"].slice(0, 4) })).status, 400);
  assert.equal((await call("PUT", "/api/profile", s, { showcase: earned.slice(0, 2) })).status, 200);
  assert.deepEqual((await call("GET", "/api/auth/me", s)).json.showcase, earned.slice(0, 2));

  // рамки за отметки и фоны за задания: открытое — можно, закрытое — нет
  const open = p.json.frames.find((f: any) => f.unlocked);
  const closed = p.json.frames.find((f: any) => !f.unlocked);
  if (open) assert.equal((await call("PUT", "/api/profile", s, { frame: open.id })).status, 200);
  if (closed) assert.equal((await call("PUT", "/api/profile", s, { frame: closed.id })).status, 400);
  const bgOpen = p.json.backgrounds.filter((b: any) => b.unlocked).pop();
  const bgClosed = p.json.backgrounds.find((b: any) => !b.unlocked);
  assert.equal((await call("PUT", "/api/profile", s, { background: bgOpen.id })).status, 200);
  if (bgClosed) assert.equal((await call("PUT", "/api/profile", s, { background: bgClosed.id })).status, 400);

  // одноклассники видят оформление в рейтинге и карточке; чужой класс — нет
  const board = (await call("GET", "/api/student/streak", s)).json.leaderboard;
  const meRow = board.find((r: any) => r.me);
  if (open) assert.equal(meRow.frame, open.id, "рамку видно в рейтинге класса");
  const mate = board.find((r: any) => !r.me);
  const card = await call("GET", `/api/student/classmates/${mate.id}`, s);
  assert.equal(card.status, 200);
  assert.ok("achievements" in card.json && "background" in card.json);
  const stranger = mod.get("SELECT u.id FROM users u JOIN class_students cs ON cs.student_id = u.id JOIN classes c ON c.id = cs.class_id WHERE c.name = '9А' LIMIT 1")!;
  assert.equal((await call("GET", `/api/student/classmates/${stranger.id}`, s)).status, 404);
  await call("PUT", "/api/profile", s, { avatar: null, frame: null, background: null, showcase: [] });

  // учителю рамки/фоны недоступны; пароль меняется только с верным текущим
  const t = await login("teacher", "teacher");
  assert.equal((await call("PUT", "/api/profile", t, { frame: "gold" })).status, 400);
  assert.equal((await call("PUT", "/api/profile", t, { background: "dawn" })).status, 400);
  assert.equal((await call("PUT", "/api/profile/password", t, { current: "wrong", next: "newpass1" })).status, 400);
  const weak = await call("PUT", "/api/profile/password", t, { current: "demo", next: "newpass" });
  assert.equal(weak.status, 400, "новый пароль: 8+ символов, буква и цифра");
  assert.ok(weak.json.details.includes("Пароль — минимум 8 символов"), JSON.stringify(weak.json));
  assert.equal((await call("PUT", "/api/profile/password", t, { current: "demo", next: "newpass1" })).status, 200);
  assert.equal((await call("POST", "/api/auth/login", undefined, { login: "teacher", password: "newpass1", role: "teacher" })).status, 200);
  mod.db.prepare("UPDATE users SET password_hash = ? WHERE login = 'teacher'").run((await import("bcryptjs")).default.hashSync("demo", 8));
});
