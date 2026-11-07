import { all, get } from "../db.js";
import { bookWithFiles } from "./materials.js";
import { CATALOG } from "../data/library.js";
import { BELLS } from "../data/school.js";
import { today } from "../calendar.js";
import { HttpError } from "../http.js";

/** Базовый SELECT урока со всем, что нужно интерфейсу. */
export const LESSON_SELECT = `
  SELECT l.id, l.date, l.lesson_no, l.homework, l.marked_at, l.flipped, l.assignment_id,
         ta.class_id, c.name AS class_name, c.grade,
         s.id AS subject_id, s.code AS subject_code, s.name AS subject_name, s.color AS subject_color,
         u.short_name AS teacher_name, ta.teacher_id, ss.room,
         ct.id AS topic_id, ct.title AS topic, ct.section, ct.section_no, ct.paragraph, ct.kind AS topic_kind, ct.seq AS topic_seq
    FROM lessons l
    JOIN teacher_assignments ta ON ta.id = l.assignment_id
    JOIN classes c ON c.id = ta.class_id
    JOIN subjects s ON s.id = ta.subject_id
    JOIN users u ON u.id = ta.teacher_id
    JOIN schedule_slots ss ON ss.id = l.slot_id
    LEFT JOIN curriculum_topics ct ON ct.id = l.topic_id`;

export type LessonRow = Record<string, any>;

function nowMinutes() {
  const fixed = process.env.KLASNA_NOW; // напр. "10:40" для демо
  if (fixed) {
    const [h, m] = fixed.split(":").map(Number);
    return h * 60 + m;
  }
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export function lessonTiming(date: string, no: number) {
  const [start, end] = BELLS[no] ?? ["", ""];
  const t = today();
  let state: "past" | "now" | "next" | "upcoming" = "upcoming";
  if (date < t) state = "past";
  else if (date === t) {
    const n = nowMinutes();
    if (n >= toMin(end)) state = "past";
    else if (n >= toMin(start)) state = "now";
  }
  return { start, end, state };
}

export function shapeLesson(r: LessonRow) {
  return {
    id: r.id,
    date: r.date,
    lessonNo: r.lesson_no,
    ...(() => {
      const t = lessonTiming(r.date, r.lesson_no);
      return { start: t.start, end: t.end, state: t.state };
    })(),
    classId: r.class_id,
    className: r.class_name,
    grade: r.grade,
    subject: { id: r.subject_id, code: r.subject_code, name: r.subject_name, color: r.subject_color },
    teacher: r.teacher_name,
    room: r.room,
    topic: r.topic_id
      ? { id: r.topic_id, title: r.topic, section: r.section, sectionNo: r.section_no, paragraph: r.paragraph, kind: r.topic_kind, seq: r.topic_seq }
      : null,
    homework: r.homework ?? null,
    marked: !!r.marked_at,
    flipped: !!r.flipped,
  };
}
export type Lesson = ReturnType<typeof shapeLesson>;

/** Отмечаем «следующий» урок дня, чтобы интерфейс мог его подсветить. */
export function markNext<T extends { state: string; date: string }>(lessons: T[]) {
  const t = today();
  const idx = lessons.findIndex((l) => l.date === t && l.state === "upcoming");
  if (idx >= 0 && !lessons.some((l) => l.state === "now")) (lessons[idx] as any).state = "next";
  return lessons;
}

export function teacherCanAccessClass(teacherId: number, classId: number) {
  const r = get(
    `SELECT 1 FROM teacher_assignments WHERE teacher_id = ? AND class_id = ?
     UNION SELECT 1 FROM classes WHERE id = ? AND homeroom_teacher_id = ?`,
    teacherId, classId, classId, teacherId,
  );
  if (!r) throw new HttpError(403, "Этот класс не закреплён за вами");
}

/** Учебник предмета для класса из каталога 5–11; url — PDF из materials/Учебники или null, если файл ещё не положен. */
export function textbookFor(subjectId: number, grade: number) {
  const code = get("SELECT code FROM subjects WHERE id = ?", subjectId)?.code as string | undefined;
  const b = CATALOG.find((x) => x.subject_code === code && x.grade === grade);
  return b ? bookWithFiles(b) : null;
}

export const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);
