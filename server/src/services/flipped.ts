/**
 * Перевёрнутый урок — пометка учителя на конкретном уроке: новую тему ученики изучают дома
 * (это и есть домашнее задание к уроку), а на самом уроке — практика и обсуждение.
 */
import { all, db, get, run, tx } from "../db.js";
import { addDays, today } from "../calendar.js";

/** Шаблон ДЗ к перевёрнутому уроку — учитель может переписать его своими словами */
export const flippedHomework = (paragraph: string | null, title: string) =>
  `Изучите дома новую тему: ${paragraph ? `${paragraph} ` : ""}«${title}» — прочитайте параграф и разберите примеры. На уроке будем решать задачи.`;

/** Следующий урок того же предмета в том же классе — к нему сдают ДЗ */
export function nextLessonOf(assignmentId: number, date: string, lessonNo: number) {
  return get(
    `SELECT l.id, l.date, l.flipped, ct.title, ct.paragraph, ct.section_no FROM lessons l
       LEFT JOIN curriculum_topics ct ON ct.id = l.topic_id
      WHERE l.assignment_id = ? AND (l.date > ? OR (l.date = ? AND l.lesson_no > ?))
      ORDER BY l.date, l.lesson_no LIMIT 1`,
    assignmentId, date, date, lessonNo,
  );
}

const DEMO_SUBJECTS = ["biology", "physics", "history_by", "geography", "world_history"];
const DEMO_PER_CLASS = 3;

/** Демо: у части предметов ближайший урок — перевёрнутый, ДЗ к нему уже задано */
export function markDemoFlipped(d = today()) {
  const asg = all(
    `SELECT ta.id, ta.class_id FROM teacher_assignments ta JOIN subjects s ON s.id = ta.subject_id
      WHERE s.code IN (${DEMO_SUBJECTS.map(() => "?").join(",")}) ORDER BY ta.class_id, ta.id`,
    ...DEMO_SUBJECTS,
  );
  const perClass = new Map<number, number>();
  tx(() => {
    for (const a of asg) {
      if ((perClass.get(a.class_id) ?? 0) >= DEMO_PER_CLASS) continue;
      // ДЗ задано на последнем прошедшем уроке → сдаётся на ближайшем; его и делаем перевёрнутым, если там новая тема
      const prev = get("SELECT id, date, lesson_no FROM lessons WHERE assignment_id = ? AND date <= ? ORDER BY date DESC, lesson_no DESC LIMIT 1", a.id, d);
      const next = prev && get(
        `SELECT l.id, l.date, ct.title, ct.paragraph, ct.kind FROM lessons l JOIN curriculum_topics ct ON ct.id = l.topic_id
          WHERE l.assignment_id = ? AND (l.date > ? OR (l.date = ? AND l.lesson_no > ?)) ORDER BY l.date, l.lesson_no LIMIT 1`,
        a.id, prev.date, prev.date, prev.lesson_no,
      );
      if (!next || next.date <= d || next.date > addDays(d, 6) || next.kind === "control" || next.kind === "review") continue;
      run("UPDATE lessons SET flipped = 1 WHERE id = ?", next.id);
      run("UPDATE lessons SET homework = ? WHERE id = ?", flippedHomework(next.paragraph, next.title), prev.id);
      perClass.set(a.class_id, (perClass.get(a.class_id) ?? 0) + 1);
    }
  });
  db.exec("PRAGMA user_version = 1");
}

/** Уже существующая база: один раз добавляем демо-перевёрнутые уроки */
export function syncDemoFlipped() {
  if (Number(get("PRAGMA user_version")?.user_version ?? 0) >= 1) return;
  markDemoFlipped();
}
