/**
 * Конструктор интерактивных заданий (свой аналог BoxApps/LearningApps).
 * Пять типов: тест с выбором ответа, найди пару, пропуски в тексте, порядок, группы.
 * Задание можно назначить классу — ученики выполняют его, учитель видит результаты.
 */
import { z } from "zod";
import { all, get, run } from "../db.js";
import { HttpError } from "../http.js";
import { today } from "../calendar.js";

const txt = (max: number, what: string) => z.string().trim().min(1, `Заполните ${what}`).max(max, `${what[0].toUpperCase()}${what.slice(1)} — не длиннее ${max} символов`);

export const ChoiceData = z.object({
  questions: z.array(z.object({
    q: txt(300, "вопрос"),
    options: z.array(txt(150, "вариант ответа")).min(2, "В вопросе нужно минимум 2 варианта").max(6, "Не больше 6 вариантов в вопросе"),
    correct: z.array(z.number().int().min(0)).min(1, "Отметьте хотя бы один верный ответ"),
  }).refine((x) => x.correct.every((i) => i < x.options.length), "Верный ответ указывает на несуществующий вариант"))
    .min(1, "Добавьте хотя бы один вопрос").max(30, "Не больше 30 вопросов"),
});

export const PairsData = z.object({
  pairs: z.array(z.object({ a: txt(120, "левую часть пары"), b: txt(120, "правую часть пары") }))
    .min(2, "Нужно минимум 2 пары").max(12, "Не больше 12 пар"),
});

/** В тексте пропуски в квадратных скобках: «Столица Беларуси — [Минск].», варианты через «|»: [5|пять] */
export const GAP_RE = /\[([^\[\]]+)\]/g;
export const GapsData = z.object({
  text: txt(3000, "текст").refine((t) => (t.match(GAP_RE) ?? []).length >= 1, "Отметьте в тексте хотя бы один пропуск в [квадратных скобках]")
    .refine((t) => (t.match(GAP_RE) ?? []).length <= 40, "Не больше 40 пропусков"),
});

export const OrderData = z.object({
  items: z.array(txt(150, "шаг")).min(3, "Нужно минимум 3 элемента").max(12, "Не больше 12 элементов"),
});

export const GroupsData = z.object({
  groups: z.array(z.object({
    name: txt(60, "название группы"),
    items: z.array(txt(80, "элемент группы")).min(1, "В каждой группе нужен хотя бы один элемент").max(12, "Не больше 12 элементов в группе"),
  })).min(2, "Нужно минимум 2 группы").max(4, "Не больше 4 групп"),
});

export const TASK_TYPES = ["choice", "pairs", "gaps", "order", "groups"] as const;
export type TaskType = (typeof TASK_TYPES)[number];
const DATA: Record<TaskType, z.ZodTypeAny> = { choice: ChoiceData, pairs: PairsData, gaps: GapsData, order: OrderData, groups: GroupsData };

export const TaskBody = z.object({
  type: z.enum(TASK_TYPES),
  title: txt(120, "название задания"),
  subjectId: z.number().int().positive().nullable().optional(),
  grade: z.number().int().min(1).max(11).nullable().optional(),
  data: z.unknown(),
}).superRefine((b, ctx) => {
  const r = DATA[b.type].safeParse(b.data);
  if (!r.success) {
    for (const i of r.error.issues) {
      const at = where(i.path);
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["data", ...i.path], message: at ? `${at}: ${i.message}` : i.message });
    }
  }
});

/** ["questions", 1, "options", 0] → «Вопрос 2, вариант 1» */
function where(p: (string | number)[]) {
  const NAMES: Record<string, string> = { questions: "Вопрос", options: "вариант", pairs: "Пара", items: "Элемент", groups: "Группа" };
  const out: string[] = [];
  for (let k = 0; k < p.length - 1; k++) {
    if (typeof p[k] === "string" && typeof p[k + 1] === "number" && NAMES[p[k] as string]) out.push(`${NAMES[p[k] as string]} ${(p[k + 1] as number) + 1}`);
  }
  return out.map((s, i) => (i ? s.toLowerCase() : s)).join(", ").replace(/^./, (c) => c.toUpperCase());
}

export function cleanData(type: TaskType, data: unknown) {
  return DATA[type].parse(data);
}

/** Учитель ведёт предмет хотя бы в одном классе (есть строка teacher_assignments). */
export function teacherTeachesSubject(teacherId: number, subjectId: number) {
  return !!get("SELECT 1 FROM teacher_assignments WHERE teacher_id = ? AND subject_id = ? LIMIT 1", teacherId, subjectId);
}

/** data задания из базы; повреждённый JSON не роняет список заданий (500) — отдаём null */
function parseTaskData(s: unknown): unknown {
  try {
    return JSON.parse(String(s));
  } catch {
    return null;
  }
}

export function shapeTask(r: any) {
  return {
    id: r.id as number, type: r.type as TaskType, title: r.title as string,
    subject: r.subject_id ? { id: r.subject_id as number, name: r.subject_name as string, color: r.subject_color as string } : null,
    grade: (r.grade as number | null) ?? null, data: parseTaskData(r.data) as any, createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  };
}

export const AssignBody = z.object({
  classId: z.number().int().positive(),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  note: z.string().trim().max(300).nullable().optional(),
});

/** Учитель ведёт хотя бы один предмет в этом классе или является классным руководителем. */
export function teacherSeesClass(teacherId: number, classId: number) {
  return !!get(
    `SELECT 1 FROM classes c WHERE c.id = ? AND (c.homeroom_teacher_id = ? OR EXISTS (
       SELECT 1 FROM teacher_assignments ta WHERE ta.class_id = c.id AND ta.teacher_id = ?))`,
    classId, teacherId, teacherId,
  );
}

export function assignTask(teacherId: number, taskId: number, body: z.infer<typeof AssignBody>) {
  const task = get("SELECT id, teacher_id, title FROM tasks WHERE id = ?", taskId);
  if (!task) throw new HttpError(404, "Задание не найдено");
  if (task.teacher_id !== teacherId) throw new HttpError(403, "Это задание другого учителя");
  const cls = get("SELECT id, name, grade FROM classes WHERE id = ?", body.classId);
  if (!cls) throw new HttpError(404, "Класс не найден");
  if (!teacherSeesClass(teacherId, body.classId)) throw new HttpError(403, "Вы не ведёте этот класс");
  const dueOn = body.dueOn ?? null;
  if (dueOn && dueOn < today()) throw new HttpError(400, "Срок сдачи не может быть в прошлом");
  const existing = get("SELECT id FROM task_assignments WHERE task_id = ? AND class_id = ?", taskId, body.classId);
  if (existing) {
    run("UPDATE task_assignments SET due_on = ?, note = ?, assigned_by = ? WHERE id = ?",
      dueOn, body.note?.trim() || null, teacherId, existing.id);
    return shapeAssignment(get(ASSIGN_SELECT + " WHERE a.id = ?", existing.id)!);
  }
  const r = run(
    "INSERT INTO task_assignments (task_id, class_id, assigned_by, due_on, note) VALUES (?,?,?,?,?)",
    taskId, body.classId, teacherId, dueOn, body.note?.trim() || null,
  );
  return shapeAssignment(get(ASSIGN_SELECT + " WHERE a.id = ?", Number(r.lastInsertRowid))!);
}

const ASSIGN_SELECT = `SELECT a.*, t.type, t.title, t.data, t.grade AS task_grade, t.subject_id,
  s.name AS subject_name, s.color AS subject_color, c.name AS class_name, c.grade AS class_grade,
  (SELECT COUNT(*) FROM class_students cs WHERE cs.class_id = a.class_id) AS students,
  (SELECT COUNT(*) FROM task_attempts ta2 WHERE ta2.assignment_id = a.id) AS done
  FROM task_assignments a
  JOIN tasks t ON t.id = a.task_id
  JOIN classes c ON c.id = a.class_id
  LEFT JOIN subjects s ON s.id = t.subject_id`;

function shapeAssignment(r: any) {
  return {
    id: r.id as number,
    taskId: r.task_id as number,
    title: r.title as string,
    type: r.type as TaskType,
    class: { id: r.class_id as number, name: r.class_name as string, grade: r.class_grade as number },
    subject: r.subject_id ? { id: r.subject_id as number, name: r.subject_name as string, color: r.subject_color as string } : null,
    dueOn: (r.due_on as string | null) ?? null,
    note: (r.note as string | null) ?? null,
    createdAt: r.created_at as string,
    students: Number(r.students ?? 0),
    done: Number(r.done ?? 0),
  };
}

export function listTaskAssignments(teacherId: number, taskId: number) {
  const task = get("SELECT id, teacher_id FROM tasks WHERE id = ?", taskId);
  if (!task) throw new HttpError(404, "Задание не найдено");
  if (task.teacher_id !== teacherId) throw new HttpError(403, "Это задание другого учителя");
  return all(`${ASSIGN_SELECT} WHERE a.task_id = ? ORDER BY a.created_at DESC`, taskId).map(shapeAssignment);
}

export function assignmentResults(teacherId: number, assignmentId: number) {
  const a = get(`${ASSIGN_SELECT} WHERE a.id = ?`, assignmentId);
  if (!a) throw new HttpError(404, "Назначение не найдено");
  const task = get("SELECT teacher_id FROM tasks WHERE id = ?", a.task_id);
  if (!task || task.teacher_id !== teacherId) throw new HttpError(403, "Это задание другого учителя");
  const students = all(
    `SELECT u.id, u.short_name, ta.score, ta.total, ta.submitted_at
       FROM class_students cs JOIN users u ON u.id = cs.student_id
       LEFT JOIN task_attempts ta ON ta.assignment_id = ? AND ta.student_id = u.id
      WHERE cs.class_id = ?
      ORDER BY u.short_name COLLATE NOCASE`,
    assignmentId, a.class_id,
  ).map((s) => ({
    id: s.id as number,
    name: s.short_name as string,
    score: s.score == null ? null : Number(s.score),
    total: s.total == null ? null : Number(s.total),
    submittedAt: (s.submitted_at as string | null) ?? null,
  }));
  return { assignment: shapeAssignment(a), students };
}

export function unassignTask(teacherId: number, assignmentId: number) {
  const a = get("SELECT a.id, t.teacher_id FROM task_assignments a JOIN tasks t ON t.id = a.task_id WHERE a.id = ?", assignmentId);
  if (!a) throw new HttpError(404, "Назначение не найдено");
  if (a.teacher_id !== teacherId) throw new HttpError(403, "Это задание другого учителя");
  run("DELETE FROM task_assignments WHERE id = ?", assignmentId);
  return { ok: true };
}

/** Задания, назначенные классу ученика */
export function studentAssignedTasks(studentId: number, classId: number) {
  const done = new Map(
    all("SELECT assignment_id, score, total, submitted_at FROM task_attempts WHERE student_id = ?", studentId)
      .map((r) => [r.assignment_id as number, { score: Number(r.score), total: Number(r.total), submittedAt: r.submitted_at as string }]),
  );
  return all(
    `${ASSIGN_SELECT} WHERE a.class_id = ? ORDER BY CASE WHEN a.due_on IS NULL THEN 1 ELSE 0 END, a.due_on, a.created_at DESC`,
    classId,
  ).map((r) => {
    const base = shapeAssignment(r);
    const att = done.get(base.id);
    return {
      ...base,
      size: taskSize(base.type, parseTaskData(r.data)),
      done: !!att,
      score: att?.score ?? null,
      total: att?.total ?? null,
      submittedAt: att?.submittedAt ?? null,
    };
  });
}

export function studentTaskPlay(studentId: number, classId: number, assignmentId: number) {
  const a = get(`${ASSIGN_SELECT} WHERE a.id = ? AND a.class_id = ?`, assignmentId, classId);
  if (!a) throw new HttpError(404, "Задание не найдено");
  const attempt = get("SELECT score, total, submitted_at FROM task_attempts WHERE assignment_id = ? AND student_id = ?", assignmentId, studentId);
  const data = parseTaskData(a.data);
  if (!data) throw new HttpError(410, "Задание повреждено — попросите учителя открыть его заново");
  return {
    assignmentId: a.id as number,
    title: a.title as string,
    type: a.type as TaskType,
    data,
    subject: a.subject_id ? { id: a.subject_id as number, name: a.subject_name as string, color: a.subject_color as string } : null,
    dueOn: (a.due_on as string | null) ?? null,
    note: (a.note as string | null) ?? null,
    done: !!attempt,
    score: attempt ? Number(attempt.score) : null,
    total: attempt ? Number(attempt.total) : null,
  };
}

export function submitTaskAttempt(studentId: number, classId: number, assignmentId: number, score: number, total: number) {
  const a = get("SELECT id FROM task_assignments WHERE id = ? AND class_id = ?", assignmentId, classId);
  if (!a) throw new HttpError(404, "Задание не найдено");
  if (!Number.isInteger(score) || !Number.isInteger(total) || total < 1 || score < 0 || score > total) {
    throw new HttpError(400, "Некорректный результат");
  }
  run(
    `INSERT INTO task_attempts (assignment_id, student_id, score, total) VALUES (?,?,?,?)
     ON CONFLICT(assignment_id, student_id) DO UPDATE SET score = excluded.score, total = excluded.total, submitted_at = datetime('now')`,
    assignmentId, studentId, score, total,
  );
  return { score, total, done: true };
}

export const TASK_SELECT = `SELECT t.*, s.name AS subject_name, s.color AS subject_color FROM tasks t LEFT JOIN subjects s ON s.id = t.subject_id`;

export function taskSize(type: TaskType, data: any): number {
  if (!DATA[type]?.safeParse(data).success) return 0; // повреждённое задание — размер 0, а не 500
  switch (type) {
    case "choice": return data.questions.length;
    case "pairs": return data.pairs.length;
    case "gaps": return (data.text.match(GAP_RE) ?? []).length;
    case "order": return data.items.length;
    case "groups": return data.groups.reduce((n: number, g: any) => n + g.items.length, 0);
  }
}

/** Демо-задания для учителя математики (кладутся при заполнении демо-базы) */
export function seedDemoTasks(teacherId: number) {
  const already = !!get("SELECT 1 FROM tasks WHERE teacher_id = ? LIMIT 1", teacherId);
  if (already) {
    seedDemoTaskAssignment(teacherId);
    return;
  }
  const subj = (code: string) => get("SELECT id FROM subjects WHERE code = ?", code)?.id ?? null;
  const demo: { type: TaskType; title: string; subject: string; grade: number; data: unknown }[] = [
    {
      type: "pairs", title: "Одночлены и многочлены: найди результат", subject: "algebra", grade: 7,
      data: { pairs: [
        { a: "2a · 3a", b: "6a²" }, { a: "x(x + 2)", b: "x² + 2x" }, { a: "(a + b) − (a − b)", b: "2b" },
        { a: "3x · (−2y)", b: "−6xy" }, { a: "a² · a³", b: "a⁵" },
      ] },
    },
    {
      type: "choice", title: "Степень с натуральным показателем", subject: "algebra", grade: 7,
      data: { questions: [
        { q: "Чему равно 2⁵?", options: ["10", "25", "32", "64"], correct: [2] },
        { q: "Какие выражения равны a⁶?", options: ["a² · a³", "(a³)²", "a⁸ : a²", "a³ + a³"], correct: [1, 2] },
        { q: "(−1)¹⁰¹ равно…", options: ["1", "−1", "101", "0"], correct: [1] },
      ] },
    },
    {
      type: "gaps", title: "Правила действий со степенями", subject: "algebra", grade: 7,
      data: { text: "При умножении степеней с одинаковыми основаниями показатели [складывают|складываются], а основание оставляют [прежним|тем же].\nПри делении степеней с одинаковыми основаниями показатели [вычитают|вычитаются].\nПри возведении степени в степень показатели [перемножают|перемножаются]." },
    },
    {
      type: "order", title: "Алгоритм решения линейного уравнения", subject: "algebra", grade: 7,
      data: { items: ["Раскрыть скобки", "Перенести слагаемые с переменной в левую часть, числа — в правую", "Привести подобные слагаемые", "Разделить обе части на коэффициент при переменной", "Записать ответ"] },
    },
    {
      type: "groups", title: "Одночлен или многочлен?", subject: "algebra", grade: 7,
      data: { groups: [
        { name: "Одночлены", items: ["5a²b", "−x", "0,3xy³", "7"] },
        { name: "Многочлены", items: ["a + b", "x² − 2x + 1", "3ab − b²", "y³ + 1"] },
      ] },
    },
  ];
  for (const d of demo) {
    run("INSERT INTO tasks (teacher_id, type, title, subject_id, grade, data) VALUES (?,?,?,?,?,?)",
      teacherId, d.type, d.title, subj(d.subject), d.grade, JSON.stringify(cleanData(d.type, d.data)));
  }
  seedDemoTaskAssignment(teacherId);
}

/** Одно демо-задание сразу назначено 7Б — чтобы показать связку «конструктор → класс → результаты». */
export function seedDemoTaskAssignment(teacherId: number) {
  if (get("SELECT 1 FROM task_assignments a JOIN tasks t ON t.id = a.task_id WHERE t.teacher_id = ? LIMIT 1", teacherId)) return;
  const task = get("SELECT id FROM tasks WHERE teacher_id = ? AND type = 'pairs' ORDER BY id LIMIT 1", teacherId);
  const cls = get("SELECT id FROM classes WHERE name = '7Б'");
  if (!task || !cls) return;
  run("INSERT OR IGNORE INTO task_assignments (task_id, class_id, assigned_by, due_on, note) VALUES (?,?,?,?,?)",
    task.id, cls.id, teacherId, null, "Демо: назначено классу из конструктора");
}

/** Для уже существующей демо-базы: если задания есть, а назначений нет — создаём одно. */
export function syncDemoTaskAssignments() {
  const teacher = get("SELECT id FROM users WHERE login = 'teacher' AND role = 'teacher'");
  if (teacher) seedDemoTaskAssignment(teacher.id as number);
}

export const listTasks = (teacherId: number) =>
  all(`${TASK_SELECT} WHERE t.teacher_id = ? ORDER BY t.updated_at DESC, t.id DESC`, teacherId).map((r) => {
    const t = shapeTask(r);
    const assigned = Number(get("SELECT COUNT(*) AS n FROM task_assignments WHERE task_id = ?", t.id)?.n ?? 0);
    return { ...t, size: taskSize(t.type, t.data), assigned };
  });
