/** Конструктор заданий: свои задания учителя (CRUD + назначение классу). Подключается внутри teacherRouter — роль уже проверена. */
import { Router } from "express";
import { all, get, run } from "../db.js";
import { me } from "../auth.js";
import { HttpError, h, intParam, parse } from "../http.js";
import {
  AssignBody, TASK_SELECT, TaskBody, assignmentResults, assignTask, cleanData, listTaskAssignments,
  listTasks, shapeTask, teacherTeachesSubject, unassignTask,
} from "../services/tasks.js";

export const tasksRouter = Router();

function own(teacherId: number, id: number) {
  const r = get(`${TASK_SELECT} WHERE t.id = ?`, id);
  if (!r) throw new HttpError(404, "Задание не найдено");
  if (r.teacher_id !== teacherId) throw new HttpError(403, "Это задание другого учителя");
  return r;
}

/** Предмет задания — только тот, который учитель ведёт (хотя бы в одном классе). Без предмета — можно. */
function checkSubject(teacherId: number, subjectId: number | null | undefined) {
  if (subjectId == null) return;
  if (!get("SELECT 1 FROM subjects WHERE id = ?", subjectId)) throw new HttpError(400, "Нет такого предмета");
  if (!teacherTeachesSubject(teacherId, subjectId)) {
    throw new HttpError(403, "Вы не ведёте этот предмет — выберите один из своих предметов или оставьте задание без предмета");
  }
}

tasksRouter.get("/", h((req) => {
  const t = me(req);
  const mine = all(
    `SELECT DISTINCT s.id, c.grade FROM teacher_assignments ta JOIN subjects s ON s.id = ta.subject_id JOIN classes c ON c.id = ta.class_id WHERE ta.teacher_id = ?`,
    t.id,
  );
  return {
    tasks: listTasks(t.id),
    subjects: all("SELECT id, name, color FROM subjects ORDER BY name"),
    mine: { subjectIds: [...new Set(mine.map((m) => m.id as number))], grades: [...new Set(mine.map((m) => m.grade as number))].sort((a, b) => a - b) },
  };
}));

tasksRouter.get("/assignments/:assignmentId/results", h((req) =>
  assignmentResults(me(req).id, intParam(req.params.assignmentId, "assignmentId"))));
tasksRouter.delete("/assignments/:assignmentId", h((req) =>
  unassignTask(me(req).id, intParam(req.params.assignmentId, "assignmentId"))));
tasksRouter.get("/:id/assignments", h((req) => listTaskAssignments(me(req).id, intParam(req.params.id))));
tasksRouter.post("/:id/assign", h((req) => {
  const t = me(req);
  const id = intParam(req.params.id);
  return assignTask(t.id, id, parse(AssignBody, req.body ?? {}));
}));

tasksRouter.get("/:id", h((req) => shapeTask(own(me(req).id, intParam(req.params.id)))));

tasksRouter.post("/", h((req) => {
  const t = me(req);
  const b = parse(TaskBody, req.body);
  checkSubject(t.id, b.subjectId);
  if ((get("SELECT COUNT(*) AS n FROM tasks WHERE teacher_id = ?", t.id)?.n ?? 0) >= 500) throw new HttpError(400, "Слишком много заданий — удалите ненужные");
  const r = run("INSERT INTO tasks (teacher_id, type, title, subject_id, grade, data) VALUES (?,?,?,?,?,?)",
    t.id, b.type, b.title, b.subjectId ?? null, b.grade ?? null, JSON.stringify(cleanData(b.type, b.data)));
  return shapeTask(get(`${TASK_SELECT} WHERE t.id = ?`, Number(r.lastInsertRowid)));
}));

tasksRouter.put("/:id", h((req) => {
  const t = me(req);
  const id = intParam(req.params.id);
  own(t.id, id);
  const b = parse(TaskBody, req.body);
  checkSubject(t.id, b.subjectId);
  run("UPDATE tasks SET type = ?, title = ?, subject_id = ?, grade = ?, data = ?, updated_at = datetime('now') WHERE id = ?",
    b.type, b.title, b.subjectId ?? null, b.grade ?? null, JSON.stringify(cleanData(b.type, b.data)), id);
  return shapeTask(get(`${TASK_SELECT} WHERE t.id = ?`, id));
}));

tasksRouter.post("/:id/copy", h((req) => {
  const t = me(req);
  const src = own(t.id, intParam(req.params.id));
  const r = run("INSERT INTO tasks (teacher_id, type, title, subject_id, grade, data) VALUES (?,?,?,?,?,?)",
    t.id, src.type, `${String(src.title).slice(0, 110)} (копия)`, src.subject_id, src.grade, src.data);
  return shapeTask(get(`${TASK_SELECT} WHERE t.id = ?`, Number(r.lastInsertRowid)));
}));

tasksRouter.delete("/:id", h((req) => {
  const t = me(req);
  const id = intParam(req.params.id);
  own(t.id, id);
  run("DELETE FROM tasks WHERE id = ?", id);
  return { ok: true };
}));
