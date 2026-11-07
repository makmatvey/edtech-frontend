import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
/** Папка с данными пользователей в корне проекта (в git не попадает). */
export const DATA_DIR = path.resolve(here, "../../data");
export const DB_PATH = process.env.KLASNA_DB ?? path.join(DATA_DIR, "klasna.db");

prepareDbFile(DB_PATH);

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  login TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student','teacher')),
  full_name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  avatar TEXT,
  frame TEXT,
  showcase TEXT,
  background TEXT
);

CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  grade INTEGER NOT NULL,
  homeroom_teacher_id INTEGER REFERENCES users(id),
  join_code TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS class_students (
  student_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  color TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teacher_assignments (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  class_id INTEGER NOT NULL REFERENCES classes(id),
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  hours_per_week INTEGER NOT NULL,
  UNIQUE (class_id, subject_id)
);

CREATE TABLE IF NOT EXISTS schedule_slots (
  id INTEGER PRIMARY KEY,
  assignment_id INTEGER NOT NULL REFERENCES teacher_assignments(id),
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 5),
  lesson_no INTEGER NOT NULL CHECK (lesson_no BETWEEN 1 AND 8),
  room TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS textbooks (
  id INTEGER PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  grade INTEGER NOT NULL,
  title TEXT NOT NULL,
  authors TEXT,
  language TEXT NOT NULL,
  url TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS curriculum_topics (
  id INTEGER PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  grade INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  section_no INTEGER NOT NULL,
  section TEXT NOT NULL,
  title TEXT NOT NULL,
  paragraph TEXT,
  kind TEXT NOT NULL DEFAULT 'regular' CHECK (kind IN ('regular','control','review')),
  UNIQUE (subject_id, grade, seq)
);

CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY,
  slot_id INTEGER NOT NULL REFERENCES schedule_slots(id),
  assignment_id INTEGER NOT NULL REFERENCES teacher_assignments(id),
  date TEXT NOT NULL,
  lesson_no INTEGER NOT NULL,
  topic_id INTEGER REFERENCES curriculum_topics(id),
  homework TEXT,
  marked_at TEXT,
  flipped INTEGER NOT NULL DEFAULT 0,
  UNIQUE (slot_id, date)
);
CREATE INDEX IF NOT EXISTS idx_lessons_date ON lessons(date);
CREATE INDEX IF NOT EXISTS idx_lessons_assignment ON lessons(assignment_id, date);

CREATE TABLE IF NOT EXISTS attendance (
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL CHECK (status IN ('present','absent','excused','late')),
  PRIMARY KEY (lesson_id, student_id)
);

CREATE TABLE IF NOT EXISTS grades (
  id INTEGER PRIMARY KEY,
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id),
  value INTEGER NOT NULL CHECK (value BETWEEN 1 AND 10),
  kind TEXT NOT NULL CHECK (kind IN ('answer','independent','control','homework')),
  UNIQUE (lesson_id, student_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_grades_student ON grades(student_id);

CREATE TABLE IF NOT EXISTS resources (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  subject_id INTEGER REFERENCES subjects(id),
  grade_from INTEGER NOT NULL DEFAULT 1,
  grade_to INTEGER NOT NULL DEFAULT 11
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id INTEGER PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  grade INTEGER NOT NULL,
  section_no INTEGER NOT NULL,
  question TEXT NOT NULL,
  options TEXT NOT NULL,
  correct INTEGER NOT NULL,
  explanation TEXT,
  answer TEXT
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id),
  mode TEXT NOT NULL CHECK (mode IN ('daily','homework','flipped','exam')),
  lesson_id INTEGER REFERENCES lessons(id),
  date TEXT NOT NULL,
  question_ids TEXT NOT NULL,
  answers TEXT,
  score INTEGER,
  total INTEGER NOT NULL,
  passed INTEGER,
  variant TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_attempts_student ON quiz_attempts(student_id, date);

CREATE TABLE IF NOT EXISTS streak_days (
  student_id INTEGER NOT NULL REFERENCES users(id),
  date TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('daily','homework')),
  xp INTEGER NOT NULL DEFAULT 10,
  PRIMARY KEY (student_id, date)
);

CREATE TABLE IF NOT EXISTS homework_done (
  student_id INTEGER NOT NULL REFERENCES users(id),
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  done_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (student_id, lesson_id)
);

-- Конструктор интерактивных заданий: data — JSON, структура зависит от type
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('choice','pairs','gaps','order','groups')),
  title TEXT NOT NULL,
  subject_id INTEGER REFERENCES subjects(id),
  grade INTEGER,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tasks_teacher ON tasks(teacher_id, updated_at);

-- Назначение интерактивного задания классу + результаты учеников
CREATE TABLE IF NOT EXISTS task_assignments (
  id INTEGER PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  assigned_by INTEGER NOT NULL REFERENCES users(id),
  due_on TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (task_id, class_id)
);
CREATE INDEX IF NOT EXISTS idx_task_assignments_class ON task_assignments(class_id, created_at);

CREATE TABLE IF NOT EXISTS task_attempts (
  id INTEGER PRIMARY KEY,
  assignment_id INTEGER NOT NULL REFERENCES task_assignments(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (assignment_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_task_attempts_student ON task_attempts(student_id, submitted_at);

CREATE TABLE IF NOT EXISTS flipped_prep (
  student_id INTEGER NOT NULL REFERENCES users(id),
  lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  prepared_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (student_id, lesson_id)
);

-- Журнал доступа к данным: кто, когда, что изменил или посмотрел (без паролей и тел запросов)
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  user_id INTEGER,
  role TEXT,
  login TEXT,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status INTEGER NOT NULL,
  ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, at);
`;

export function migrate() {
  db.exec(SCHEMA);
  ensureQuizModes();
  ensureQuizVariantColumn();
  ensureLessonFlippedColumn();
  ensureQuestionAnswerColumn();
  ensureProfileColumns();
}

/** Профиль: аватарка (data URL), рамка за отметки, витрина значков (JSON) */
function ensureProfileColumns() {
  const cols = new Set(all("PRAGMA table_info(users)").map((c) => c.name));
  for (const c of ["avatar", "frame", "showcase", "background"]) if (!cols.has(c)) db.exec(`ALTER TABLE users ADD COLUMN ${c} TEXT`);
}

/** Часть В: JSON-массив допустимых кратких ответов; у вопросов с выбором — NULL. */
function ensureQuestionAnswerColumn() {
  const cols = all("PRAGMA table_info(quiz_questions)");
  if (cols.some((c) => c.name === "answer")) return;
  db.exec("ALTER TABLE quiz_questions ADD COLUMN answer TEXT");
}

/** Пометка «перевёрнутый урок» ставится учителем на урок. */
function ensureLessonFlippedColumn() {
  const cols = all("PRAGMA table_info(lessons)");
  if (cols.some((c) => c.name === "flipped")) return;
  db.exec("ALTER TABLE lessons ADD COLUMN flipped INTEGER NOT NULL DEFAULT 0");
}

/** Старые базы создавались с mode IN ('daily','homework') — расширяем без потери данных. */
function ensureQuizModes() {
  const row = get("SELECT sql FROM sqlite_master WHERE type='table' AND name='quiz_attempts'");
  if (!row?.sql || String(row.sql).includes("'flipped'")) return;
  db.exec(`
    BEGIN;
    CREATE TABLE quiz_attempts__new (
      id INTEGER PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES users(id),
      mode TEXT NOT NULL CHECK (mode IN ('daily','homework','flipped','exam')),
      lesson_id INTEGER REFERENCES lessons(id),
      date TEXT NOT NULL,
      question_ids TEXT NOT NULL,
      answers TEXT,
      score INTEGER,
      total INTEGER NOT NULL,
      passed INTEGER,
      variant TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      submitted_at TEXT
    );
    INSERT INTO quiz_attempts__new (id, student_id, mode, lesson_id, date, question_ids, answers, score, total, passed, created_at, submitted_at)
      SELECT id, student_id, mode, lesson_id, date, question_ids, answers, score, total, passed, created_at, submitted_at FROM quiz_attempts;
    DROP TABLE quiz_attempts;
    ALTER TABLE quiz_attempts__new RENAME TO quiz_attempts;
    CREATE INDEX IF NOT EXISTS idx_attempts_student ON quiz_attempts(student_id, date);
    COMMIT;
  `);
}

/** Колонка variant для попыток ЦТ/ЦЭ («2024-1» и т.п.). */
function ensureQuizVariantColumn() {
  const cols = all("PRAGMA table_info(quiz_attempts)");
  if (cols.some((c) => c.name === "variant")) return;
  db.exec("ALTER TABLE quiz_attempts ADD COLUMN variant TEXT");
}

/**
 * Создаёт папку для базы и один раз переносит базу со старого места (server/klasna.db),
 * чтобы уже введённые данные не потерялись. Файлы -wal/-shm переносятся вместе с ней.
 */
function prepareDbFile(file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (process.env.KLASNA_DB || fs.existsSync(file)) return;
  const legacy = path.resolve(here, "../klasna.db");
  if (!fs.existsSync(legacy)) return;
  for (const suffix of ["", "-wal", "-shm"]) {
    if (fs.existsSync(legacy + suffix)) fs.renameSync(legacy + suffix, file + suffix);
  }
  console.log(`База перенесена: ${legacy} → ${file}`);
}

/** Транзакция (node:sqlite не даёт хелпера). Вложенные вызовы выполняются внутри внешней. */
let depth = 0;
export function tx<T>(fn: () => T): T {
  if (depth > 0) return fn();
  db.exec("BEGIN");
  depth++;
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  } finally {
    depth--;
  }
}

export type Row = Record<string, any>;
export const all = (sql: string, ...p: any[]) => db.prepare(sql).all(...p) as Row[];
export const get = (sql: string, ...p: any[]) => db.prepare(sql).get(...p) as Row | undefined;
export const run = (sql: string, ...p: any[]) => db.prepare(sql).run(...p);
