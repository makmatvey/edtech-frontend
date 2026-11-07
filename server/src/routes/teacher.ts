import { Router, type Response } from "express";
import { z } from "zod";
import { all, get, run, tx } from "../db.js";
import { authenticate, me, requireRole } from "../auth.js";
import { HttpError, h, intParam, parse } from "../http.js";
import { QUARTERS, addDays, currentQuarter, isSchoolDay, mondayOf, today } from "../calendar.js";
import {
  LESSON_SELECT, avg, markNext, shapeLesson, teacherCanAccessClass, textbookFor,
} from "../services/lessons.js";
import { nextLessonOf } from "../services/flipped.js";
import { isRight, parseJsonArray } from "../services/quiz.js";
import { SECTIONS, bookWithFiles, materialsForLesson, materialsIn, sectionsSummary, type SectionKey } from "../services/materials.js";
import { CATALOG } from "../data/library.js";
import { streakBrief } from "../services/streak.js";
import { tasksRouter } from "./tasks.js";

export const teacherRouter = Router();
teacherRouter.use(authenticate, requireRole("teacher"));
teacherRouter.use("/tasks", tasksRouter);

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата в формате ГГГГ-ММ-ДД");

function quarterRange(q: unknown) {
  const no = Number(q);
  if (q !== undefined && no === 0) return { no: 0, from: QUARTERS[0].from, to: today() };
  const quarter = QUARTERS.find((x) => x.no === no) ?? currentQuarter();
  return { ...quarter, to: quarter.to < today() ? quarter.to : today() };
}

/** Без выбранного предмета: классный руководитель видит все предметы класса, остальные — только свои. */
function teacherScope(teacherId: number, classId: number, subjectId: number | null): number | null {
  if (subjectId) return null;
  const hr = get("SELECT 1 FROM classes WHERE id = ? AND homeroom_teacher_id = ?", classId, teacherId);
  return hr ? null : teacherId;
}

/** Классы и предметы учителя */
teacherRouter.get("/classes", h((req) => {
  const t = me(req);
  const rows = all(
    `SELECT c.id AS class_id, c.name, c.grade, c.homeroom_teacher_id = ? AS homeroom, c.join_code,
            s.id AS subject_id, s.code, s.name AS subject, s.color, ta.hours_per_week,
            (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = c.id) AS students
       FROM teacher_assignments ta
       JOIN classes c ON c.id = ta.class_id
       JOIN subjects s ON s.id = ta.subject_id
      WHERE ta.teacher_id = ?
      ORDER BY c.grade, c.name, s.name`,
    t.id, t.id,
  );
  const map = new Map<number, any>();
  for (const r of rows) {
    if (!map.has(r.class_id)) map.set(r.class_id, { id: r.class_id, name: r.name, grade: r.grade, homeroom: !!r.homeroom, joinCode: r.homeroom ? r.join_code : null, students: r.students, subjects: [] });
    map.get(r.class_id).subjects.push({ id: r.subject_id, code: r.code, name: r.subject, color: r.color, hours: r.hours_per_week });
  }
  // Классное руководство без своих уроков тоже показываем
  const hr = get("SELECT id, name, grade, join_code, (SELECT COUNT(*) FROM class_students WHERE class_id = classes.id) AS students FROM classes WHERE homeroom_teacher_id = ?", t.id);
  if (hr && !map.has(hr.id)) map.set(hr.id, { id: hr.id, name: hr.name, grade: hr.grade, homeroom: true, joinCode: hr.join_code, students: hr.students, subjects: [] });
  return [...map.values()];
}));

/** Главная учителя: сегодня, незаполненные уроки, ближайшие контрольные, что класс не понял */
teacherRouter.get("/dashboard", h((req) => {
  const t = me(req);
  const d = today();
  const todayLessons = markNext(all(`${LESSON_SELECT} WHERE ta.teacher_id = ? AND l.date = ? ORDER BY l.lesson_no`, t.id, d).map(shapeLesson));
  const lessonsWithStats = todayLessons.map((l) => ({ ...l, ...lessonCounts(l.id) }));

  const unmarked = all(
    `${LESSON_SELECT} WHERE ta.teacher_id = ? AND l.date < ? AND l.date >= ? AND l.marked_at IS NULL ORDER BY l.date DESC, l.lesson_no`,
    t.id, d, QUARTERS[0].from,
  ).map(shapeLesson);

  const controls = all(
    `${LESSON_SELECT} WHERE ta.teacher_id = ? AND l.date >= ? AND l.date <= ? AND ct.kind = 'control' ORDER BY l.date, l.lesson_no`,
    t.id, d, addDays(d, 21),
  ).map(shapeLesson);

  // Слабые темы по результатам «Квиза дня» за 14 дней в классах учителя (по его предметам)
  const weak = weakSections(t.id, null, addDays(d, -14), d).slice(0, 4);

  const q = currentQuarter();
  const stats = get(
    `SELECT
       (SELECT ROUND(AVG(g.value), 2) FROM grades g JOIN lessons l ON l.id = g.lesson_id JOIN teacher_assignments ta ON ta.id = l.assignment_id
          WHERE ta.teacher_id = ? AND l.date BETWEEN ? AND ?) AS avg_grade,
       (SELECT ROUND(100.0 * SUM(a.status IN ('present','late')) / COUNT(*), 1) FROM attendance a JOIN lessons l ON l.id = a.lesson_id JOIN teacher_assignments ta ON ta.id = l.assignment_id
          WHERE ta.teacher_id = ? AND l.date BETWEEN ? AND ?) AS attendance,
       (SELECT COUNT(*) FROM lessons l JOIN teacher_assignments ta ON ta.id = l.assignment_id
          WHERE ta.teacher_id = ? AND l.date BETWEEN ? AND ? AND l.marked_at IS NOT NULL) AS lessons_done`,
    t.id, q.from, d, t.id, q.from, d, t.id, q.from, d,
  );

  // Кому нужна помощь: низкий средний балл по предметам учителя в четверти или много пропусков (2 недели)
  const lowAvg = all(
    `SELECT u.id, u.short_name AS name, c.name AS class_name, s.name AS subject, ROUND(AVG(g.value), 1) AS avg, COUNT(*) AS n
       FROM grades g JOIN lessons l ON l.id = g.lesson_id JOIN teacher_assignments ta ON ta.id = l.assignment_id
       JOIN users u ON u.id = g.student_id JOIN classes c ON c.id = ta.class_id JOIN subjects s ON s.id = ta.subject_id
      WHERE ta.teacher_id = ? AND l.date BETWEEN ? AND ?
      GROUP BY u.id, ta.subject_id HAVING n >= 2 AND AVG(g.value) < 5 ORDER BY avg LIMIT 6`,
    t.id, q.from, d,
  );
  const missing = all(
    `SELECT u.id, u.short_name AS name, c.name AS class_name, COUNT(*) AS total, SUM(a.status IN ('absent','excused')) AS missed
       FROM attendance a JOIN lessons l ON l.id = a.lesson_id JOIN teacher_assignments ta ON ta.id = l.assignment_id
       JOIN users u ON u.id = a.student_id JOIN classes c ON c.id = ta.class_id
      WHERE ta.teacher_id = ? AND l.date BETWEEN ? AND ?
      GROUP BY u.id HAVING total >= 3 AND (1.0 * missed / total) > 0.2 ORDER BY (1.0 * missed / total) DESC LIMIT 6`,
    t.id, addDays(d, -14), d,
  );
  const attention = new Map<number, { id: number; name: string; className: string; reasons: string[] }>();
  const add = (r: any, reason: string) => {
    const x = attention.get(r.id) ?? { id: r.id, name: r.name, className: r.class_name, reasons: [] as string[] };
    x.reasons.push(reason); attention.set(r.id, x);
  };
  for (const r of lowAvg) add(r, `${r.subject}: средний ${String(r.avg).replace(".", ",")}`);
  for (const r of missing) add(r, `пропустил(а) ${r.missed} из ${r.total} уроков за 2 недели`);

  return {
    date: d,
    isSchoolDay: isSchoolDay(d),
    quarter: q.no,
    attention: [...attention.values()].slice(0, 4),
    today: lessonsWithStats,
    unmarked,
    controls,
    weak,
    stats: { avgGrade: stats?.avg_grade ?? null, attendance: stats?.attendance ?? null, lessonsDone: stats?.lessons_done ?? 0 },
  };
}));

function lessonCounts(lessonId: number) {
  const r = get(
    `SELECT COUNT(*) AS total, SUM(status IN ('present','late')) AS present FROM attendance WHERE lesson_id = ?`,
    lessonId,
  );
  const g = get("SELECT COUNT(*) AS n FROM grades WHERE lesson_id = ?", lessonId);
  return { presentCount: r?.present ?? 0, attendanceTotal: r?.total ?? 0, gradesCount: g?.n ?? 0 };
}

/** Расписание учителя на неделю с темой каждого урока */
teacherRouter.get("/schedule", h((req) => {
  const t = me(req);
  const week = mondayOf(req.query.week ? parse(dateStr, req.query.week) : today());
  const lessons = markNext(all(
    `${LESSON_SELECT} WHERE ta.teacher_id = ? AND l.date BETWEEN ? AND ? ORDER BY l.date, l.lesson_no`,
    t.id, week, addDays(week, 4),
  ).map(shapeLesson));
  const days = [0, 1, 2, 3, 4].map((i) => {
    const date = addDays(week, i);
    return { date, schoolDay: isSchoolDay(date), lessons: lessons.filter((l) => l.date === date) };
  });
  return { week, prev: addDays(week, -7), next: addDays(week, 7), days };
}));

function loadLessonForTeacher(teacherId: number, id: number) {
  const r = get(`${LESSON_SELECT} WHERE l.id = ?`, id);
  if (!r) throw new HttpError(404, "Урок не найден");
  if (r.teacher_id !== teacherId) throw new HttpError(403, "Это урок другого учителя");
  return r;
}

/** Карточка урока: журнал, тема, учебник, материалы */
teacherRouter.get("/lessons/:id", h((req) => {
  const t = me(req);
  const r = loadLessonForTeacher(t.id, intParam(req.params.id));
  const lesson = shapeLesson(r);
  const students = all(
    `SELECT u.id, u.full_name, u.short_name, a.status
       FROM class_students cs JOIN users u ON u.id = cs.student_id
       LEFT JOIN attendance a ON a.student_id = u.id AND a.lesson_id = ?
      WHERE cs.class_id = ? ORDER BY u.full_name`,
    lesson.id, lesson.classId,
  );
  const grades = all("SELECT student_id, value, kind FROM grades WHERE lesson_id = ?", lesson.id);
  // Средний балл ученика по предмету с начала года — подсказка при выставлении оценки
  const avgs = all(
    `SELECT g.student_id, ROUND(AVG(g.value), 1) AS avg FROM grades g JOIN lessons l ON l.id = g.lesson_id
      WHERE l.assignment_id = ? AND l.date BETWEEN ? AND ? GROUP BY g.student_id`,
    r.assignment_id, QUARTERS[0].from, lesson.date,
  );
  const avgBy = new Map(avgs.map((a) => [a.student_id, a.avg]));
  const topics = all(
    `SELECT id, seq, section_no, section, title, kind FROM curriculum_topics WHERE subject_id = ? AND grade = ? ORDER BY seq`,
    lesson.subject.id, lesson.grade,
  );
  const siblings = get(
    `SELECT
       (SELECT id FROM lessons WHERE assignment_id = ? AND (date < ? OR (date = ? AND lesson_no < ?)) ORDER BY date DESC, lesson_no DESC LIMIT 1) AS prev,
       (SELECT id FROM lessons WHERE assignment_id = ? AND (date > ? OR (date = ? AND lesson_no > ?)) ORDER BY date, lesson_no LIMIT 1) AS next`,
    r.assignment_id, lesson.date, lesson.date, lesson.lessonNo, r.assignment_id, lesson.date, lesson.date, lesson.lessonNo,
  );
  return {
    lesson,
    canMark: lesson.date <= today(),
    students: students.map((s) => ({
      id: s.id,
      fullName: s.full_name,
      shortName: s.short_name,
      status: s.status ?? null,
      grades: grades.filter((g) => g.student_id === s.id).map((g) => ({ value: g.value, kind: g.kind })),
      quarterAvg: avgBy.get(s.id) ?? null,
    })),
    topics,
    textbook: textbookFor(lesson.subject.id, lesson.grade),
    materials: materialsForLesson(lesson.subject.code, lesson.grade).slice(0, 8),
    prevId: siblings?.prev ?? null,
    nextId: siblings?.next ?? null,
    next: (() => {
      const n = siblings?.next ? get(`${LESSON_SELECT} WHERE l.id = ?`, siblings.next) : null;
      if (!n) return null;
      const x = shapeLesson(n);
      return { id: x.id, date: x.date, lessonNo: x.lessonNo, topic: x.topic, flipped: x.flipped };
    })(),
  };
}));

const JournalBody = z.object({
  topicId: z.number().int().positive().optional(),
  homework: z.string().max(500).nullable().optional(),
  /** следующий урок по предмету — перевёрнутый: новую тему ученики изучают дома */
  nextFlipped: z.boolean().optional(),
  attendance: z.array(z.object({
    studentId: z.number().int().positive(),
    status: z.enum(["present", "absent", "excused", "late"]),
  })).optional(),
  grades: z.array(z.object({
    studentId: z.number().int().positive(),
    kind: z.enum(["answer", "independent", "control", "homework"]),
    value: z.number().int().min(1, "Оценка от 1 до 10").max(10, "Оценка от 1 до 10").nullable(),
  })).optional(),
});

/** Сохранение журнала урока одной транзакцией */
teacherRouter.put("/lessons/:id", h((req) => {
  const t = me(req);
  const id = intParam(req.params.id);
  const r = loadLessonForTeacher(t.id, id);
  const body = parse(JournalBody, req.body);
  const isFuture = r.date > today();
  if (isFuture && (body.attendance?.length || body.grades?.length)) {
    throw new HttpError(400, "Посещаемость и оценки можно ставить только за проведённые уроки");
  }
  const classStudents = new Set(all("SELECT student_id FROM class_students WHERE class_id = ?", r.class_id).map((s) => s.student_id));
  for (const x of [...(body.attendance ?? []), ...(body.grades ?? [])]) {
    if (!classStudents.has(x.studentId)) throw new HttpError(400, "Ученик не из этого класса");
  }
  if (body.topicId) {
    const topic = get("SELECT 1 FROM curriculum_topics WHERE id = ? AND subject_id = ? AND grade = ?", body.topicId, r.subject_id, r.grade);
    if (!topic) throw new HttpError(400, "Тема не из программы этого предмета");
  }
  const next = body.nextFlipped !== undefined ? nextLessonOf(r.assignment_id, r.date, r.lesson_no) : null;
  if (body.nextFlipped !== undefined && !next) throw new HttpError(400, "Следующего урока по этому предмету в расписании нет");
  tx(() => {
    if (next) run("UPDATE lessons SET flipped = ? WHERE id = ?", body.nextFlipped ? 1 : 0, next.id);
    if (body.topicId) run("UPDATE lessons SET topic_id = ? WHERE id = ?", body.topicId, id);
    if (body.homework !== undefined) run("UPDATE lessons SET homework = ? WHERE id = ?", body.homework?.trim() || null, id);
    for (const g of body.grades ?? []) {
      if (g.value == null) run("DELETE FROM grades WHERE lesson_id = ? AND student_id = ? AND kind = ?", id, g.studentId, g.kind);
      else {
        // За урок у ученика только одна оценка (ответ / самостоятельная / контрольная / ДЗ)
        run("DELETE FROM grades WHERE lesson_id = ? AND student_id = ? AND kind != ?", id, g.studentId, g.kind);
        run(
          `INSERT INTO grades (lesson_id, student_id, value, kind) VALUES (?,?,?,?)
           ON CONFLICT (lesson_id, student_id, kind) DO UPDATE SET value = excluded.value`,
          id, g.studentId, g.value, g.kind,
        );
      }
    }
    for (const a of body.attendance ?? []) {
      run(
        `INSERT INTO attendance (lesson_id, student_id, status) VALUES (?,?,?)
         ON CONFLICT (lesson_id, student_id) DO UPDATE SET status = excluded.status`,
        id, a.studentId, a.status,
      );
      // Н / Ув снимает оценку — после оценок, чтобы в одном запросе побеждала посещаемость
      if (a.status === "absent" || a.status === "excused") {
        run("DELETE FROM grades WHERE lesson_id = ? AND student_id = ?", id, a.studentId);
      }
    }
    // Журнал заполнен при любом содержательном сохранении проведённого урока (посещаемость, оценки, тема или ДЗ),
    // а не только при отметке посещаемости. Время первого заполнения не перезаписываем.
    // Будущие уроки (планирование темы/ДЗ заранее) заполненными не считаются; «следующий — перевёрнутый» тоже.
    const filled = !!(body.attendance?.length || body.grades?.length || body.topicId || body.homework !== undefined);
    if (filled && !isFuture) run("UPDATE lessons SET marked_at = COALESCE(marked_at, datetime('now')) WHERE id = ?", id);
  });
  return { ok: true, ...lessonCounts(id) };
}));

/** Посещаемость класса за период */
teacherRouter.get("/attendance", h((req) => {
  const t = me(req);
  const classId = intParam(req.query.classId, "classId");
  teacherCanAccessClass(t.id, classId);
  const subjectId = req.query.subjectId ? intParam(req.query.subjectId, "subjectId") : null;
  const scope = teacherScope(t.id, classId, subjectId);
  const to = req.query.to ? parse(dateStr, req.query.to) : today();
  const from = req.query.from ? parse(dateStr, req.query.from) : addDays(mondayOf(to), -21);
  if (from > to) throw new HttpError(400, "Начало периода позже конца");

  const students = all(
    `SELECT u.id, u.full_name, u.short_name FROM class_students cs JOIN users u ON u.id = cs.student_id WHERE cs.class_id = ? ORDER BY u.full_name`,
    classId,
  );
  const rows = all(
    `SELECT a.student_id, l.date, a.status
       FROM attendance a JOIN lessons l ON l.id = a.lesson_id JOIN teacher_assignments ta ON ta.id = l.assignment_id
      WHERE ta.class_id = ? AND l.date BETWEEN ? AND ? AND (? IS NULL OR ta.subject_id = ?) AND (? IS NULL OR ta.teacher_id = ?)`,
    classId, from, to, subjectId, subjectId, scope, scope,
  );
  const dates = [...new Set(rows.map((r) => r.date as string))].sort();
  const cell = new Map<string, { total: number; absent: number; excused: number; late: number }>();
  const per = new Map<number, { total: number; absent: number; excused: number; late: number }>();
  for (const r of rows) {
    const k = `${r.student_id}:${r.date}`;
    const c = cell.get(k) ?? { total: 0, absent: 0, excused: 0, late: 0 };
    const p = per.get(r.student_id) ?? { total: 0, absent: 0, excused: 0, late: 0 };
    for (const o of [c, p]) {
      o.total++;
      if (r.status === "absent") o.absent++;
      if (r.status === "excused") o.excused++;
      if (r.status === "late") o.late++;
    }
    cell.set(k, c);
    per.set(r.student_id, p);
  }
  const result = students.map((s) => {
    const p = per.get(s.id) ?? { total: 0, absent: 0, excused: 0, late: 0 };
    const rate = p.total ? Math.round(((p.total - p.absent - p.excused) / p.total) * 1000) / 10 : null;
    return {
      id: s.id,
      fullName: s.full_name,
      shortName: s.short_name,
      ...p,
      rate,
      atRisk: rate != null && (rate < 85 || p.absent >= 4),
      days: dates.map((d) => cell.get(`${s.id}:${d}`) ?? null),
    };
  });
  // Динамика по неделям
  const weekly = all(
    `SELECT l.date, a.status FROM attendance a JOIN lessons l ON l.id = a.lesson_id JOIN teacher_assignments ta ON ta.id = l.assignment_id
      WHERE ta.class_id = ? AND l.date BETWEEN ? AND ? AND (? IS NULL OR ta.subject_id = ?) AND (? IS NULL OR ta.teacher_id = ?)`,
    classId, QUARTERS[0].from, to, subjectId, subjectId, scope, scope,
  );
  const wk = new Map<string, { t: number; p: number }>();
  for (const w of weekly) {
    const k = mondayOf(w.date);
    const o = wk.get(k) ?? { t: 0, p: 0 };
    o.t++;
    if (w.status === "present" || w.status === "late") o.p++;
    wk.set(k, o);
  }
  const totals = result.reduce((a, s) => ({ total: a.total + s.total, missed: a.missed + s.absent + s.excused, absent: a.absent + s.absent }), { total: 0, missed: 0, absent: 0 });
  return {
    from, to, dates,
    students: result,
    summary: {
      rate: totals.total ? Math.round(((totals.total - totals.missed) / totals.total) * 1000) / 10 : null,
      missedLessons: totals.missed,
      unexcused: totals.absent,
      atRisk: result.filter((s) => s.atRisk).length,
    },
    weekly: [...wk].sort().map(([week, o]) => ({ week, rate: Math.round((o.p / o.t) * 1000) / 10 })),
  };
}));

/** Успеваемость класса */
teacherRouter.get("/performance", h((req) => {
  const t = me(req);
  const classId = intParam(req.query.classId, "classId");
  teacherCanAccessClass(t.id, classId);
  const subjectId = req.query.subjectId ? intParam(req.query.subjectId, "subjectId") : null;
  const scope = teacherScope(t.id, classId, subjectId);
  const q = quarterRange(req.query.quarter);

  const rows = all(
    `SELECT g.student_id, g.value, g.kind, l.date, s.id AS subject_id, s.name AS subject, s.color
       FROM grades g JOIN lessons l ON l.id = g.lesson_id
       JOIN teacher_assignments ta ON ta.id = l.assignment_id JOIN subjects s ON s.id = ta.subject_id
      WHERE ta.class_id = ? AND l.date BETWEEN ? AND ? AND (? IS NULL OR ta.subject_id = ?) AND (? IS NULL OR ta.teacher_id = ?)
      ORDER BY l.date`,
    classId, q.from, q.to, subjectId, subjectId, scope, scope,
  );
  const students = all(
    `SELECT u.id, u.full_name, u.short_name FROM class_students cs JOIN users u ON u.id = cs.student_id WHERE cs.class_id = ? ORDER BY u.full_name`,
    classId,
  );
  const distribution = Array.from({ length: 10 }, (_, i) => ({ value: i + 1, count: rows.filter((r) => r.value === i + 1).length }));
  const bySubject = new Map<number, { name: string; color: string; values: number[] }>();
  for (const r of rows) {
    const o = bySubject.get(r.subject_id) ?? { name: r.subject, color: r.color, values: [] as number[] };
    o.values.push(r.value);
    bySubject.set(r.subject_id, o);
  }
  const wk = new Map<string, number[]>();
  for (const r of rows) {
    const k = mondayOf(r.date);
    wk.set(k, [...(wk.get(k) ?? []), r.value]);
  }
  const studentStats = students.map((s) => {
    const vals = rows.filter((r) => r.student_id === s.id);
    const all_ = vals.map((v) => v.value);
    const recent = all_.slice(-4);
    const average = avg(all_);
    const trend = average != null && recent.length >= 3 ? Math.round(((avg(recent) ?? 0) - average) * 10) / 10 : 0;
    return {
      id: s.id,
      fullName: s.full_name,
      shortName: s.short_name,
      average,
      count: all_.length,
      recent: vals.slice(-6).map((v) => ({ value: v.value, kind: v.kind, date: v.date })),
      trend,
      needsAttention: average != null && (average < 5 || trend <= -1.2),
    };
  });
  const values = rows.map((r) => r.value);
  return {
    quarter: q.no,
    from: q.from,
    to: q.to,
    average: avg(values),
    count: values.length,
    quality: values.length ? Math.round((values.filter((v) => v >= 7).length / values.length) * 1000) / 10 : null,
    distribution,
    subjects: [...bySubject].map(([id, o]) => ({ id, name: o.name, color: o.color, average: avg(o.values), count: o.values.length })),
    weekly: [...wk].sort().map(([week, v]) => ({ week, average: avg(v) })),
    students: studentStats.sort((a, b) => (b.average ?? 0) - (a.average ?? 0)),
  };
}));

/** Программа (КТП) по предмету в классе: пройдено / впереди / отставание */
teacherRouter.get("/curriculum", h((req) => {
  const t = me(req);
  const classId = intParam(req.query.classId, "classId");
  const subjectId = intParam(req.query.subjectId, "subjectId");
  const asg = get("SELECT ta.id, c.grade, c.name FROM teacher_assignments ta JOIN classes c ON c.id = ta.class_id WHERE ta.class_id = ? AND ta.subject_id = ?", classId, subjectId);
  if (!asg) throw new HttpError(404, "Этот предмет не изучается в классе");
  teacherCanAccessClass(t.id, classId);
  const d = today();
  const topics = all(
    `SELECT ct.id, ct.seq, ct.section_no, ct.section, ct.title, ct.paragraph, ct.kind,
            (SELECT l.id FROM lessons l WHERE l.assignment_id = ? AND l.topic_id = ct.id ORDER BY l.date LIMIT 1) AS lesson_id
       FROM curriculum_topics ct WHERE ct.subject_id = ? AND ct.grade = ? ORDER BY ct.seq`,
    asg.id, subjectId, asg.grade,
  );
  const lessonInfo = new Map(all("SELECT id, date, lesson_no, marked_at FROM lessons WHERE assignment_id = ?", asg.id).map((l) => [l.id, l]));
  const shaped = topics.map((tp) => {
    const l = tp.lesson_id ? lessonInfo.get(tp.lesson_id) : null;
    let status: "done" | "unmarked" | "today" | "planned" | "unscheduled" = "unscheduled";
    if (l) {
      if (l.date < d) status = l.marked_at ? "done" : "unmarked";
      else if (l.date === d) status = l.marked_at ? "done" : "today";
      else status = "planned";
    }
    return {
      id: tp.id, seq: tp.seq, sectionNo: tp.section_no, section: tp.section, title: tp.title, paragraph: tp.paragraph, kind: tp.kind,
      lessonId: l?.id ?? null, date: l?.date ?? null, status,
    };
  });
  const sections = [...new Set(shaped.map((s) => s.sectionNo))].map((no) => {
    const items = shaped.filter((s) => s.sectionNo === no);
    return { no, title: items[0].section, hours: items.length, done: items.filter((i) => i.status === "done").length, topics: items };
  });
  const done = shaped.filter((s) => s.status === "done").length;
  const due = shaped.filter((s) => s.date && s.date <= d).length;
  return {
    className: asg.name,
    total: shaped.length,
    done,
    due,
    behind: shaped.filter((s) => s.status === "unmarked").length,
    textbook: textbookFor(subjectId, asg.grade),
    sections,
  };
}));

/** Что класс не понял: точность ответов «Квиза дня» по разделам программы */
function weakSections(teacherId: number, classId: number | null, from: string, to: string) {
  const attempts = all(
    `SELECT qa.question_ids, qa.answers, cs.class_id FROM quiz_attempts qa
       JOIN class_students cs ON cs.student_id = qa.student_id
      WHERE qa.submitted_at IS NOT NULL AND qa.date BETWEEN ? AND ? AND (? IS NULL OR cs.class_id = ?)`,
    from, to, classId, classId,
  );
  const mine = all(
    `SELECT ta.class_id, ta.subject_id, c.name AS class_name, c.grade FROM teacher_assignments ta JOIN classes c ON c.id = ta.class_id WHERE ta.teacher_id = ?`,
    teacherId,
  );
  const mineKey = new Map(mine.map((m) => [`${m.class_id}:${m.subject_id}`, m]));
  const qs = new Map(all("SELECT q.id, q.subject_id, q.section_no, q.correct, q.answer, s.name AS subject, s.color FROM quiz_questions q JOIN subjects s ON s.id = q.subject_id").map((q) => [q.id, q]));
  const agg = new Map<string, { classId: number; className: string; subjectId: number; subject: string; color: string; sectionNo: number; grade: number; total: number; correct: number }>();
  for (const a of attempts) {
    // Повреждённый JSON в одной попытке не должен ронять сводку (500) — такую попытку пропускаем
    const ids = parseJsonArray(a.question_ids);
    const ans = parseJsonArray(a.answers ?? "[]");
    if (!ids || !ans) continue;
    ids.forEach((qid, i) => {
      if (typeof qid !== "number") return;
      const q = qs.get(qid);
      if (!q) return;
      const m = mineKey.get(`${a.class_id}:${q.subject_id}`);
      if (!m) return;
      const k = `${a.class_id}:${q.subject_id}:${q.section_no}`;
      const o = agg.get(k) ?? { classId: a.class_id, className: m.class_name, subjectId: q.subject_id, subject: q.subject, color: q.color, sectionNo: q.section_no, grade: m.grade, total: 0, correct: 0 };
      o.total++;
      if (isRight(q, ans[i])) o.correct++;
      agg.set(k, o);
    });
  }
  const sectionTitle = (subjectId: number, grade: number, no: number) =>
    get("SELECT section FROM curriculum_topics WHERE subject_id = ? AND grade = ? AND section_no = ? LIMIT 1", subjectId, grade, no)?.section ?? `Раздел ${no}`;
  return [...agg.values()]
    .filter((o) => o.total >= 5)
    .map((o) => ({ ...o, section: sectionTitle(o.subjectId, o.grade, o.sectionNo), accuracy: Math.round((o.correct / o.total) * 100) }))
    .sort((a, b) => a.accuracy - b.accuracy);
}

/** Ежедневная активность учеников класса (стрик) и слабые темы */
teacherRouter.get("/insights", h((req) => {
  const t = me(req);
  const classId = intParam(req.query.classId, "classId");
  teacherCanAccessClass(t.id, classId);
  const d = today();
  const from = addDays(d, -14);
  const students = all(
    `SELECT u.id, u.full_name, u.short_name FROM class_students cs JOIN users u ON u.id = cs.student_id WHERE cs.class_id = ? ORDER BY u.full_name`,
    classId,
  );
  const acc = all(
    `SELECT student_id, SUM(score) AS s, SUM(total) AS t, COUNT(*) AS n FROM quiz_attempts
      WHERE submitted_at IS NOT NULL AND date BETWEEN ? AND ? GROUP BY student_id`,
    from, d,
  );
  const accBy = new Map(acc.map((a) => [a.student_id, a]));
  const list = students.map((s) => {
    const b = streakBrief(s.id, d);
    const a = accBy.get(s.id);
    return {
      id: s.id, fullName: s.full_name, shortName: s.short_name,
      streak: b.current, todayDone: b.todayDone, lastActivity: b.lastActivity,
      quizzes: a?.n ?? 0,
      accuracy: a && a.t ? Math.round((a.s / a.t) * 100) : null,
    };
  });
  const activeToday = list.filter((s) => s.todayDone).length;
  const active7 = list.filter((s) => s.lastActivity && s.lastActivity >= addDays(d, -7)).length;
  return {
    students: list.sort((a, b) => b.streak - a.streak),
    activeToday,
    active7,
    total: list.length,
    weak: weakSections(t.id, classId, from, d),
  };
}));

/** Библиотека учебников 5–11 классов + какие предметы и классы ведёт учитель (для фильтра «Мои») */
teacherRouter.get("/library", h((req) => {
  const t = me(req);
  const mine = all(
    `SELECT DISTINCT c.grade, s.code FROM teacher_assignments ta JOIN classes c ON c.id = ta.class_id JOIN subjects s ON s.id = ta.subject_id WHERE ta.teacher_id = ?`,
    t.id,
  );
  return {
    textbooks: CATALOG.map(bookWithFiles),
    mine: { subjects: [...new Set(mine.map((m) => m.code as string))], grades: [...new Set(mine.map((m) => m.grade as number))].sort((a, b) => a - b) },
  };
}));

const SectionParam = z.enum(Object.keys(SECTIONS) as [SectionKey, ...SectionKey[]]);

/** Разделы материалов и сколько в каждом файлов */
teacherRouter.get("/materials", h(() => ({ sections: sectionsSummary() })));

/** Файлы раздела: видеоуроки, методика, аудио, учебники */
teacherRouter.get("/materials/:section", h((req) => {
  const t = me(req);
  const key = parse(SectionParam, req.params.section);
  const mine = all(
    `SELECT DISTINCT c.grade, s.code FROM teacher_assignments ta JOIN classes c ON c.id = ta.class_id JOIN subjects s ON s.id = ta.subject_id WHERE ta.teacher_id = ?`,
    t.id,
  );
  return {
    section: { key, ...SECTIONS[key] },
    items: materialsIn(key),
    mine: { subjects: [...new Set(mine.map((m) => m.code as string))], grades: [...new Set(mine.map((m) => m.grade as number))].sort((a, b) => a - b) },
  };
}));

/** Уведомления учителя: журнал, контрольные, ученики в зоне риска, слабые темы */
teacherRouter.get("/notifications", h((req) => {
  const t = me(req);
  const d = today();
  const items: { id: string; kind: string; title: string; text: string; link: string; tone: "red" | "amber" | "blue" }[] = [];
  const unmarked = all(
    `${LESSON_SELECT} WHERE ta.teacher_id = ? AND l.date < ? AND l.date >= ? AND l.marked_at IS NULL ORDER BY l.date DESC LIMIT 5`,
    t.id, d, QUARTERS[0].from,
  ).map(shapeLesson);
  for (const l of unmarked) items.push({ id: `u${l.id}`, kind: "journal", title: "Журнал не заполнен", text: `${l.subject.name} · ${l.className}, ${l.date.slice(8)}.${l.date.slice(5, 7)}`, link: `/t/lesson/${l.id}`, tone: "amber" });
  const controls = all(
    `${LESSON_SELECT} WHERE ta.teacher_id = ? AND l.date >= ? AND l.date <= ? AND ct.kind = 'control' ORDER BY l.date`,
    t.id, d, addDays(d, 3),
  ).map(shapeLesson);
  for (const l of controls) items.push({ id: `c${l.id}`, kind: "control", title: l.date === d ? "Контрольная сегодня" : "Скоро контрольная", text: `${l.subject.name} · ${l.className}: ${l.topic?.title ?? ""}`, link: `/t/lesson/${l.id}`, tone: "red" });
  const hr = get("SELECT id, name FROM classes WHERE homeroom_teacher_id = ?", t.id);
  if (hr) {
    const risk = all(
      `SELECT u.id, u.short_name, COUNT(*) AS total, SUM(a.status IN ('absent','excused')) AS missed, SUM(a.status = 'absent') AS unexcused
         FROM attendance a JOIN lessons l ON l.id = a.lesson_id JOIN teacher_assignments ta ON ta.id = l.assignment_id JOIN users u ON u.id = a.student_id
        WHERE ta.class_id = ? AND l.date BETWEEN ? AND ? GROUP BY u.id HAVING (1.0 * missed / total) > 0.15 OR unexcused >= 4`,
      hr.id, addDays(d, -14), d,
    );
    for (const r of risk) items.push({ id: `r${r.id}`, kind: "risk", title: "Пропуски выше нормы", text: `${r.short_name} (${hr.name}): ${r.missed} из ${r.total} уроков за 2 недели`, link: `/t/student/${r.id}`, tone: "red" });
  }
  for (const w of weakSections(t.id, null, addDays(d, -14), d).filter((x) => x.accuracy < 60).slice(0, 3)) {
    items.push({ id: `w${w.classId}-${w.subjectId}-${w.sectionNo}`, kind: "weak", title: "Тему стоит повторить", text: `${w.className}, ${w.section}: ${w.accuracy}% верных`, link: "/t/activity", tone: "blue" });
  }
  return { items };
}));

/** Поиск: ученики классов учителя и темы его программ (кириллицу фильтруем в JS — lower() в SQLite её не понимает) */
teacherRouter.get("/search", h((req) => {
  const t = me(req);
  const q = String(req.query.q ?? "").trim().toLowerCase();
  if (q.length < 2) return { students: [], topics: [] };
  const students = all(
    `SELECT DISTINCT u.id, u.full_name, c.name AS class_name FROM users u
       JOIN class_students cs ON cs.student_id = u.id JOIN classes c ON c.id = cs.class_id
      WHERE c.homeroom_teacher_id = ? OR c.id IN (SELECT class_id FROM teacher_assignments WHERE teacher_id = ?)
      ORDER BY u.full_name`,
    t.id, t.id,
  ).filter((s) => String(s.full_name).toLowerCase().includes(q)).slice(0, 8)
    .map((s) => ({ id: s.id, fullName: s.full_name, className: s.class_name }));
  const seen = new Set<string>();
  const topics = all(
    `SELECT l.id AS lesson_id, l.date, ct.title, s.name AS subject, c.name AS class_name FROM lessons l
       JOIN teacher_assignments ta ON ta.id = l.assignment_id JOIN curriculum_topics ct ON ct.id = l.topic_id
       JOIN subjects s ON s.id = ta.subject_id JOIN classes c ON c.id = ta.class_id
      WHERE ta.teacher_id = ? AND ct.kind <> 'review' ORDER BY l.date`,
    t.id,
  ).filter((r) => {
    const k = `${r.class_name}:${r.title}`;
    if (seen.has(k) || !String(r.title).toLowerCase().includes(q)) return false;
    seen.add(k);
    return true;
  }).slice(0, 8).map((r) => ({ lessonId: r.lesson_id, date: r.date, title: r.title, subject: r.subject, className: r.class_name }));
  return { students, topics };
}));

/** Карточка ученика для учителя */
teacherRouter.get("/students/:id", h((req) => {
  const t = me(req);
  const id = intParam(req.params.id);
  const s = get(
    `SELECT u.id, u.full_name, u.short_name, u.login, c.id AS class_id, c.name AS class_name, c.homeroom_teacher_id
       FROM users u JOIN class_students cs ON cs.student_id = u.id JOIN classes c ON c.id = cs.class_id WHERE u.id = ? AND u.role = 'student'`,
    id,
  );
  if (!s) throw new HttpError(404, "Ученик не найден");
  teacherCanAccessClass(t.id, s.class_id);
  const homeroom = s.homeroom_teacher_id === t.id;
  const d = today();
  const subjects = all(
    `SELECT s.id, s.name, s.color, ta.id AS asg FROM teacher_assignments ta JOIN subjects s ON s.id = ta.subject_id
      WHERE ta.class_id = ? AND (? = 1 OR ta.teacher_id = ?) ORDER BY s.name`,
    s.class_id, homeroom ? 1 : 0, t.id,
  );
  const bySubject = subjects.map((sub) => {
    const grades = all(
      `SELECT g.value, g.kind, l.date, ct.title AS topic FROM grades g JOIN lessons l ON l.id = g.lesson_id LEFT JOIN curriculum_topics ct ON ct.id = l.topic_id
        WHERE g.student_id = ? AND l.assignment_id = ? ORDER BY l.date`,
      id, sub.asg,
    );
    const att = get(
      `SELECT COUNT(*) AS total, SUM(a.status = 'absent') AS absent, SUM(a.status = 'excused') AS excused FROM attendance a JOIN lessons l ON l.id = a.lesson_id
        WHERE a.student_id = ? AND l.assignment_id = ?`,
      id, sub.asg,
    );
    return {
      id: sub.id, name: sub.name, color: sub.color,
      average: avg(grades.map((g) => g.value)),
      grades: grades.map((g) => ({ value: g.value, kind: g.kind, date: g.date, topic: g.topic })),
      lessons: Number(att?.total ?? 0), absent: Number(att?.absent ?? 0), excused: Number(att?.excused ?? 0),
    };
  });
  const quiz = get(
    "SELECT COUNT(*) AS n, SUM(score) AS s, SUM(total) AS t FROM quiz_attempts WHERE student_id = ? AND submitted_at IS NOT NULL AND date >= ?",
    id, addDays(d, -30),
  );
  const brief = streakBrief(id, d);
  const allGrades = bySubject.flatMap((x) => x.grades.map((g) => g.value as number));
  const totalLessons = bySubject.reduce((a, x) => a + x.lessons, 0);
  const missed = bySubject.reduce((a, x) => a + x.absent + x.excused, 0);
  return {
    id: s.id, fullName: s.full_name, shortName: s.short_name, login: s.login, className: s.class_name, classId: s.class_id, homeroom,
    average: avg(allGrades),
    attendanceRate: totalLessons ? Math.round(((totalLessons - missed) / totalLessons) * 1000) / 10 : null,
    unexcused: bySubject.reduce((a, x) => a + x.absent, 0),
    missed,
    streak: brief.current, lastActivity: brief.lastActivity,
    quizzes: Number(quiz?.n ?? 0), accuracy: quiz?.t ? Math.round((quiz.s / quiz.t) * 100) : null,
    subjects: bySubject,
  };
}));

/** CSV для Excel: точка с запятой, BOM — чтобы кириллица открылась без настроек */
function csv(rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(esc).join(";")).join("\r\n");
}
function sendCsv(res: Response, name: string, body: string) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="export.csv"; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.send(body);
}
/** Средний балл с запятой — Excel (ru) читает как число, не как дату. */
function fmtAvg(v: number | null) {
  return v == null ? "" : v.toFixed(2).replace(".", ",");
}
/**
 * Список оценок как текст-формула Excel (`="8, 10, 7"`).
 * Иначе «8 10» / «8.10» при открытии CSV превращаются в даты (8.окт, 10.июл).
 */
function fmtMarks(values: number[]) {
  if (!values.length) return "";
  return `="${values.join(", ")}"`;
}

teacherRouter.get("/export/attendance.csv", h((req, res) => {
  const t = me(req);
  const classId = intParam(req.query.classId, "classId");
  teacherCanAccessClass(t.id, classId);
  const subjectId = req.query.subjectId ? intParam(req.query.subjectId, "subjectId") : null;
  const scope = teacherScope(t.id, classId, subjectId);
  const to = req.query.to ? parse(dateStr, req.query.to) : today();
  const from = req.query.from ? parse(dateStr, req.query.from) : QUARTERS[0].from;
  const cls = get("SELECT name FROM classes WHERE id = ?", classId)!;
  const rows = all(
    `SELECT u.full_name, COUNT(a.status) AS total, SUM(a.status = 'absent') AS absent, SUM(a.status = 'excused') AS excused, SUM(a.status = 'late') AS late
       FROM class_students cs JOIN users u ON u.id = cs.student_id
       LEFT JOIN attendance a ON a.student_id = u.id AND a.lesson_id IN (
         SELECT l.id FROM lessons l JOIN teacher_assignments ta ON ta.id = l.assignment_id
          WHERE ta.class_id = ? AND l.date BETWEEN ? AND ? AND (? IS NULL OR ta.subject_id = ?) AND (? IS NULL OR ta.teacher_id = ?))
      WHERE cs.class_id = ? GROUP BY u.id ORDER BY u.full_name`,
    classId, from, to, subjectId, subjectId, scope, scope, classId,
  );
  const pct = (r: any) => (r.total ? String(Math.round(((r.total - (r.absent ?? 0) - (r.excused ?? 0)) / r.total) * 1000) / 10).replace(".", ",") : "");
  sendCsv(res, `Посещаемость_${cls.name}_${from}_${to}.csv`, csv([
    [`Посещаемость ${cls.name}`, `${from} — ${to}`],
    ["Ученик", "Уроков", "Н (без причины)", "Ув (уважительная)", "Опоздания", "Посещаемость, %"],
    ...rows.map((r) => [r.full_name, r.total, r.absent ?? 0, r.excused ?? 0, r.late ?? 0, pct(r)]),
  ]));
}));

teacherRouter.get("/export/grades.csv", h((req, res) => {
  const t = me(req);
  const classId = intParam(req.query.classId, "classId");
  teacherCanAccessClass(t.id, classId);
  const subjectId = req.query.subjectId ? intParam(req.query.subjectId, "subjectId") : null;
  const scope = teacherScope(t.id, classId, subjectId);
  const q = quarterRange(req.query.quarter);
  const cls = get("SELECT name FROM classes WHERE id = ?", classId)!;
  const subjects = all(
    `SELECT s.id, s.name FROM teacher_assignments ta JOIN subjects s ON s.id = ta.subject_id
      WHERE ta.class_id = ? AND (? IS NULL OR ta.subject_id = ?) AND (? IS NULL OR ta.teacher_id = ?) ORDER BY s.name`,
    classId, subjectId, subjectId, scope, scope,
  );
  const students = all("SELECT u.id, u.full_name FROM class_students cs JOIN users u ON u.id = cs.student_id WHERE cs.class_id = ? ORDER BY u.full_name", classId);
  const g = all(
    `SELECT g.student_id, ta.subject_id, g.value FROM grades g JOIN lessons l ON l.id = g.lesson_id JOIN teacher_assignments ta ON ta.id = l.assignment_id
      WHERE ta.class_id = ? AND l.date BETWEEN ? AND ? AND (? IS NULL OR ta.subject_id = ?) AND (? IS NULL OR ta.teacher_id = ?)
      ORDER BY l.date`,
    classId, q.from, q.to, subjectId, subjectId, scope, scope,
  );
  const perStudent = students.map((st) =>
    subjects.map((s) => g.filter((x) => x.student_id === st.id && x.subject_id === s.id).map((x) => x.value as number)),
  );
  const period = q.no ? `${q.no} четверть` : "с начала учебного года";
  const avgRows = students.map((st, i) => {
    const marks = perStudent[i];
    const averages = marks.map((v) => avg(v));
    const overall = avg(averages.filter((x): x is number => x != null));
    return [i + 1, st.full_name, ...averages.map(fmtAvg), fmtAvg(overall)];
  });
  const detailRows = students.flatMap((st, i) =>
    subjects.flatMap((s, j) => {
      const values = perStudent[i][j];
      if (!values.length) return [];
      return [[st.full_name, s.name, values.length, fmtAvg(avg(values)), fmtMarks(values)]];
    }),
  );
  sendCsv(res, `Успеваемость_${cls.name}.csv`, csv([
    [`Успеваемость ${cls.name}`, period, `${q.from} — ${q.to}`],
    [],
    ["Средние баллы"],
    ["№", "Ученик", ...subjects.map((s) => s.name), "Средний балл"],
    ...avgRows,
    [],
    ["Оценки по предметам"],
    ["Ученик", "Предмет", "Оценок", "Средний", "Оценки"],
    ...detailRows,
  ]));
}));
