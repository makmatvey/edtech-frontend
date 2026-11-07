import { all, get, run, tx } from "../db.js";
import { CURRICULA, expand } from "../data/curriculum.js";
import { YEAR_START, addDays, isSchoolDay, weekday } from "../calendar.js";

/** Классы, программы которых добавлены после первого запуска (досоздаются в существующей базе). */
const SYNCED_GRADES = [6, 8, 10, 11];

/** Резервные уроки в конце программы: календарь длиннее программы — урок не остаётся без темы. */
export const RESERVE_SECTION = "Резерв: повторение и обобщение";
export const RESERVE_TITLE = "Повторение и обобщение изученного";

const findReserve = (subjectId: number, grade: number) =>
  get("SELECT id, seq, section_no FROM curriculum_topics WHERE subject_id = ? AND grade = ? AND section = ? AND title = ?",
    subjectId, grade, RESERVE_SECTION, RESERVE_TITLE);

/**
 * Тема «Повторение и обобщение» для уроков сверх программы (kind = 'review').
 * Создаётся один раз на предмет и класс, всегда стоит последней (seq и номер раздела — после программы).
 * Идемпотентна: повторный вызов возвращает ту же тему.
 */
export function ensureReserveTopic(subjectId: number, grade: number): number {
  const reserve = findReserve(subjectId, grade);
  const last = get(
    "SELECT MAX(seq) AS seq, MAX(section_no) AS section_no FROM curriculum_topics WHERE subject_id = ? AND grade = ? AND id <> ?",
    subjectId, grade, reserve?.id ?? 0,
  );
  const seq = Number(last?.seq ?? 0) + 1;
  const sectionNo = Number(last?.section_no ?? 0) + 1;
  if (reserve) {
    if (reserve.seq !== seq || reserve.section_no !== sectionNo) {
      run("UPDATE curriculum_topics SET seq = ?, section_no = ? WHERE id = ?", seq, sectionNo, reserve.id);
    }
    return reserve.id as number;
  }
  return Number(run(
    "INSERT INTO curriculum_topics (subject_id, grade, seq, section_no, section, title, paragraph, kind) VALUES (?,?,?,?,?,?,NULL,'review')",
    subjectId, grade, seq, sectionNo, RESERVE_SECTION, RESERVE_TITLE,
  ).lastInsertRowid);
}

/** Тема урока по позиции в программе; за концом программы — резервный урок повторения. */
export function topicAt(topics: { id: number }[], index: number, subjectId: number, grade: number): number {
  return topics[index]?.id ?? ensureReserveTopic(subjectId, grade);
}

/** Уроки без темы (календарь длиннее программы) получают резервную тему своего предмета и класса. */
export function fillMissingTopics() {
  tx(() => {
    const groups = all(
      `SELECT DISTINCT ta.subject_id, c.grade FROM lessons l
         JOIN teacher_assignments ta ON ta.id = l.assignment_id JOIN classes c ON c.id = ta.class_id
        WHERE l.topic_id IS NULL`,
    );
    for (const g of groups) {
      const reserveId = ensureReserveTopic(g.subject_id, g.grade);
      run(
        `UPDATE lessons SET topic_id = ? WHERE topic_id IS NULL AND assignment_id IN (
           SELECT ta.id FROM teacher_assignments ta JOIN classes c ON c.id = ta.class_id WHERE ta.subject_id = ? AND c.grade = ?)`,
        reserveId, g.subject_id, g.grade,
      );
    }
  });
}

/** Добавляет новые программы без сброса базы и заполняет только пустые темы уроков. */
export function syncExtraCurricula() {
  tx(() => {
    for (const curriculum of CURRICULA.filter((c) => SYNCED_GRADES.includes(c.grade))) {
      const subject = get("SELECT id FROM subjects WHERE code = ?", curriculum.subject);
      if (!subject) continue;
      // Если программа выросла, резервная тема не должна занимать её номер: временно убираем её с дороги
      const reserve = findReserve(subject.id, curriculum.grade);
      if (reserve) run("UPDATE curriculum_topics SET seq = -1 WHERE id = ?", reserve.id);
      for (const topic of expand(curriculum)) {
        run(`INSERT INTO curriculum_topics (subject_id, grade, seq, section_no, section, title, paragraph, kind)
          VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(subject_id, grade, seq) DO NOTHING`,
          subject.id, curriculum.grade, topic.seq, topic.sectionNo, topic.section, topic.title, topic.paragraph, topic.kind);
      }
      if (reserve) ensureReserveTopic(subject.id, curriculum.grade); // возвращаем резерв в конец программы
      const topics = all("SELECT id FROM curriculum_topics WHERE subject_id = ? AND grade = ? AND NOT (section = ? AND title = ?) ORDER BY seq",
        subject.id, curriculum.grade, RESERVE_SECTION, RESERVE_TITLE);
      const assignments = all(`SELECT ta.id FROM teacher_assignments ta JOIN classes c ON c.id = ta.class_id
        WHERE ta.subject_id = ? AND c.grade = ?`, subject.id, curriculum.grade);
      for (const assignment of assignments) {
        const slots = all("SELECT id, weekday FROM schedule_slots WHERE assignment_id = ? ORDER BY lesson_no, id", assignment.id);
        const end = get("SELECT MAX(date) AS date FROM lessons WHERE assignment_id = ?", assignment.id)?.date;
        if (!end) continue;
        let seq = 0;
        for (let date = YEAR_START; date <= end; date = addDays(date, 1)) {
          if (!isSchoolDay(date)) continue;
          for (const slot of slots.filter((s) => s.weekday === weekday(date))) {
            const topic = topics[seq++];
            if (topic) run("UPDATE lessons SET topic_id = ? WHERE slot_id = ? AND date = ? AND topic_id IS NULL", topic.id, slot.id, date);
          }
        }
      }
    }
    // Всё, что осталось без темы (уроков больше, чем тем; в т.ч. классы из сида) — резервные уроки повторения
    fillMissingTopics();
  });
}
