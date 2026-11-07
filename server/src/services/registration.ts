import bcrypt from "bcryptjs";
import { all, get, run, tx } from "../db.js";
import { HttpError } from "../http.js";
import { CURRICULA } from "../data/curriculum.js";
import { ASSIGNMENTS } from "../data/school.js";
import { QUARTERS, YEAR_START, addDays, isSchoolDay, today, weekday } from "../calendar.js";
import { topicAt } from "./curriculum-sync.js";

/** Демо-код школы — только для разработки и демо-стенда (KLASNA_DEMO=1) */
export const DEMO_SCHOOL_CODE = "SCH12-2026";

/**
 * Код школы выдаёт администрация учреждения: KLASNA_SCHOOL_CODE (от 6 символов, не демо-код).
 * В production без него сервер не стартует; демо-код допустим только вне production или при KLASNA_DEMO=1.
 */
export function resolveSchoolCode(env: NodeJS.ProcessEnv = process.env): string {
  const code = env.KLASNA_SCHOOL_CODE?.trim().toUpperCase();
  const demoAllowed = env.NODE_ENV !== "production" || env.KLASNA_DEMO === "1";
  if (code) {
    if (code === DEMO_SCHOOL_CODE && !demoAllowed) throw new Error("KLASNA_SCHOOL_CODE равен демо-коду — в production задайте настоящий код учреждения");
    if (code.length < 6) throw new Error("KLASNA_SCHOOL_CODE слишком короткий — нужно не меньше 6 символов");
    return code;
  }
  if (demoAllowed) return DEMO_SCHOOL_CODE;
  throw new Error("KLASNA_SCHOOL_CODE не задан. В production задайте код учреждения (его учителя вводят при регистрации) — без него сервер не запускается.");
}

export const SCHOOL_CODE = resolveSchoolCode();
/** Демо-код показываем на странице регистрации, только если он и правда демо */
export const isDemoSchoolCode = SCHOOL_CODE === DEMO_SCHOOL_CODE;

const TRANSLIT: Record<string, string> = { А: "A", Б: "B", В: "V", Г: "G", Д: "D", Е: "E", Ж: "Z", З: "Z", И: "I", К: "K", Л: "L", М: "M", Н: "N", О: "O", П: "P", Р: "R", С: "S", Т: "T" };
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // без 0/O и 1/I — чтобы не путали

/** Код класса вида 7B-K4P2: читается вслух и печатается на доске */
export function makeJoinCode(className: string, rand: () => number = Math.random) {
  const grade = className.replace(/\D/g, "");
  const letter = TRANSLIT[className.replace(/\d/g, "").toUpperCase()] ?? "X";
  for (;;) {
    let tail = "";
    for (let i = 0; i < 4; i++) tail += CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)];
    const code = `${grade}${letter}-${tail}`;
    if (!get("SELECT 1 FROM classes WHERE join_code = ?", code)) return code;
  }
}

/** Часы в неделю по умолчанию — как у демо-школы (по учебному плану РБ). */
export function defaultHours(subject: string, grade: number) {
  return ASSIGNMENTS.find(([c, s]) => s === subject && Number(c.replace(/\D/g, "")) === grade)?.[3]
    ?? ASSIGNMENTS.find(([, s]) => s === subject)?.[3] ?? 2;
}

/** Предметы, доступные при регистрации учителя в этом классе. */
export function subjectsForGrade(grade: number) {
  const codes = CURRICULA.filter((c) => c.grade === grade).map((c) => c.subject);
  return all("SELECT id, code, name, color FROM subjects").filter((s) => codes.includes(s.code));
}

export const GRADES = [...new Set(CURRICULA.map((c) => c.grade))].sort((a, b) => a - b);

function shortTeacher(full: string) {
  const [last, first, patr] = full.split(/\s+/);
  return `${last} ${first?.[0] ?? ""}.${patr ? ` ${patr[0]}.` : ""}`.trim();
}
function shortStudent(full: string) {
  const [last, first] = full.split(/\s+/);
  return first ? `${first} ${last}` : last;
}

function createUser(login: string, password: string, role: "teacher" | "student", fullName: string, passwordHash?: string) {
  if (get("SELECT 1 FROM users WHERE login = ?", login)) throw new HttpError(409, "Такой логин уже занят — придумайте другой");
  // маршрут регистрации передаёт хэш, посчитанный заранее асинхронно (не блокирует сервер); sync — запасной путь для тестов
  const hash = passwordHash ?? bcrypt.hashSync(password, 10);
  const short = role === "teacher" ? shortTeacher(fullName) : shortStudent(fullName);
  return Number(run("INSERT INTO users (login, password_hash, role, full_name, short_name) VALUES (?,?,?,?,?)", login, hash, role, fullName, short).lastInsertRowid);
}

export function registerStudent(input: { fullName: string; login: string; password: string; classCode: string; passwordHash?: string }) {
  const cls = get("SELECT id, name FROM classes WHERE join_code = ?", input.classCode.trim().toUpperCase());
  if (!cls) throw new HttpError(404, "Класс с таким кодом не найден. Проверьте код у классного руководителя");
  return tx(() => {
    const id = createUser(input.login, input.password, "student", input.fullName, input.passwordHash);
    run("INSERT INTO class_students (student_id, class_id) VALUES (?, ?)", id, cls.id);
    return id;
  });
}

/**
 * Учитель регистрируется по коду школы и сразу создаёт свой класс:
 * предметы → нагрузка → расписание без накладок → уроки с темами по программе
 * (позиция в программе — как если бы класс учился с 1 сентября).
 */
export function registerTeacher(input: { fullName: string; login: string; password: string; schoolCode: string; grade: number; letter: string; subjects: string[]; passwordHash?: string }) {
  if (input.schoolCode.trim().toUpperCase() !== SCHOOL_CODE) throw new HttpError(403, "Неверный код школы. Его выдаёт администрация учреждения образования");
  if (!GRADES.includes(input.grade)) throw new HttpError(400, `Сейчас доступна регистрация для ${GRADES.join(", ")} классов`);
  const letter = input.letter.trim().toUpperCase();
  if (!/^[А-ЯЁ]$/.test(letter)) throw new HttpError(400, "Буква класса — одна русская буква, например «В»");
  const className = `${input.grade}${letter}`;
  if (get("SELECT 1 FROM classes WHERE name = ?", className)) {
    throw new HttpError(409, `Класс ${className} уже есть в школе. Выберите другую букву или попросите классного руководителя добавить вас`);
  }
  const allowed = new Set(subjectsForGrade(input.grade).map((s) => s.code));
  const subjects = [...new Set(input.subjects)].filter((s) => allowed.has(s));
  if (!subjects.length) throw new HttpError(400, "Выберите хотя бы один предмет");

  return tx(() => {
    const teacherId = createUser(input.login, input.password, "teacher", input.fullName, input.passwordHash);
    const classId = Number(run("INSERT INTO classes (name, grade, homeroom_teacher_id, join_code) VALUES (?,?,?,?)", className, input.grade, teacherId, makeJoinCode(className)).lastInsertRowid);
    const room = String(100 + Math.floor(Math.random() * 230));
    const busyClass = new Set<string>();
    const dayLoad = new Map<number, number>();
    const startFrom = today(); // уроки до регистрации не создаём — журнал за них не «висит»
    const end = QUARTERS[1].to > addDays(today(), 60) ? QUARTERS[1].to : addDays(today(), 60);

    for (const code of subjects) {
      const subject = get("SELECT id FROM subjects WHERE code = ?", code)!;
      const hours = defaultHours(code, input.grade);
      const asgId = Number(run("INSERT INTO teacher_assignments (teacher_id, class_id, subject_id, hours_per_week) VALUES (?,?,?,?)", teacherId, classId, subject.id, hours).lastInsertRowid);
      // Дни с наименьшей нагрузкой; номер урока — первый свободный (у нового учителя нет других классов)
      const days = [1, 2, 3, 4, 5].sort((a, b) => (dayLoad.get(a) ?? 0) - (dayLoad.get(b) ?? 0) || a - b).slice(0, Math.min(5, hours));
      const slots: { id: number; day: number }[] = [];
      for (const day of days) {
        let no = 1;
        while (busyClass.has(`${day}:${no}`)) no++;
        busyClass.add(`${day}:${no}`);
        dayLoad.set(day, (dayLoad.get(day) ?? 0) + 1);
        slots.push({ id: Number(run("INSERT INTO schedule_slots (assignment_id, weekday, lesson_no, room) VALUES (?,?,?,?)", asgId, day, no, room).lastInsertRowid), day });
      }
      const topics = all("SELECT id FROM curriculum_topics WHERE subject_id = ? AND grade = ? ORDER BY seq", subject.id, input.grade);
      let n = 0;
      for (let d = YEAR_START; d <= end; d = addDays(d, 1)) {
        if (!isSchoolDay(d)) continue;
        for (const s of slots.filter((x) => x.day === weekday(d))) {
          const index = n++;
          if (d < startFrom) continue; // прошлые уроки не создаём, но позицию в программе учитываем
          // за концом программы — резервный урок «Повторение и обобщение», а не урок без темы
          const topicId = topicAt(topics as { id: number }[], index, subject.id, input.grade);
          const no = get("SELECT lesson_no FROM schedule_slots WHERE id = ?", s.id)!.lesson_no;
          run("INSERT INTO lessons (slot_id, assignment_id, date, lesson_no, topic_id) VALUES (?,?,?,?,?)", s.id, asgId, d, no, topicId);
        }
      }
    }
    return teacherId;
  });
}

