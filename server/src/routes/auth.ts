import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { get } from "../db.js";
import { authenticate, me, signToken } from "../auth.js";
import { HttpError, h, parse } from "../http.js";
import { SCHOOL_NAME } from "../data/school.js";
import { today } from "../calendar.js";
import { publicLook } from "../services/profile.js";
import { GRADES, SCHOOL_CODE, isDemoSchoolCode, registerStudent, registerTeacher, subjectsForGrade } from "../services/registration.js";

export const authRouter = Router();

const LoginBody = z.object({
  login: z.string().trim().min(1, "Введите логин").max(64),
  password: z.string().min(1, "Введите пароль").max(128),
  role: z.enum(["student", "teacher"]),
});

// Простейшая защита от перебора: 10 неудачных попыток за 5 минут с одного IP
const failures = new Map<string, { n: number; until: number }>();

authRouter.post("/login", h(async (req) => {
  const ip = req.ip ?? "local";
  const f = failures.get(ip);
  if (f && f.n >= 10 && f.until > Date.now()) throw new HttpError(429, "Слишком много попыток. Подождите 5 минут");
  const body = parse(LoginBody, req.body);
  const u = get("SELECT * FROM users WHERE login = ?", body.login.toLowerCase());
  // Асинхронное сравнение — не блокирует сервер для остальных запросов на время bcrypt
  if (!u || !(await bcrypt.compare(body.password, u.password_hash as string))) {
    const cur = f && f.until > Date.now() ? f : { n: 0, until: Date.now() + 5 * 60_000 };
    failures.set(ip, { n: cur.n + 1, until: cur.until });
    throw new HttpError(401, "Неверный логин или пароль");
  }
  if (u.role !== body.role) {
    throw new HttpError(403, u.role === "teacher" ? "Это аккаунт учителя — выберите «Я учитель»" : "Это аккаунт ученика — выберите «Я ученик»");
  }
  failures.delete(ip);
  const user = { id: u.id as number, role: u.role, name: u.short_name as string };
  return { token: signToken(user), user: profile(user.id) };
}));

const loginRule = z.string().trim().toLowerCase()
  .min(3, "Логин — минимум 3 символа").max(32, "Логин — не длиннее 32 символов")
  .regex(/^[a-z0-9._-]+$/, "Логин — латинские буквы, цифры, точка, дефис или подчёркивание");
const nameRule = z.string().trim().transform((v) => v.replace(/\s+/g, " ")).pipe(
  z.string()
    .refine((v) => v.split(" ").length >= 2 && v.split(" ").length <= 4, "Укажите фамилию и имя (можно с отчеством)")
    .refine((v) => /^[A-Za-zА-Яа-яЁёІіЎў' -]+$/.test(v), "В ФИО — только буквы")
    .transform((v) => v.split(" ").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")),
);
/** Правило для нового пароля (регистрация, смена в профиле). Вход старыми короткими паролями не ограничивается. */
export const passwordRule = z.string()
  .min(8, "Пароль — минимум 8 символов").max(128, "Пароль — не длиннее 128 символов")
  .regex(/\p{L}/u, "В пароле нужна хотя бы одна буква")
  .regex(/\d/, "В пароле нужна хотя бы одна цифра");

const RegisterBody = z.discriminatedUnion("role", [
  z.object({ role: z.literal("student"), fullName: nameRule, login: loginRule, password: passwordRule, classCode: z.string().trim().min(4, "Введите код класса").max(16) }),
  z.object({
    role: z.literal("teacher"), fullName: nameRule, login: loginRule, password: passwordRule,
    schoolCode: z.string().trim().min(3, "Введите код школы").max(32),
    grade: z.number().int(), letter: z.string().trim().min(1, "Укажите букву класса").max(1, "Буква класса — один символ"),
    subjects: z.array(z.string()).min(1, "Выберите хотя бы один предмет").max(12),
  }),
]);

const registrations = new Map<string, { n: number; until: number }>();

/** Что можно выбрать при регистрации учителя */
authRouter.get("/register/options", h(() => ({
  grades: GRADES.map((g) => ({ grade: g, subjects: subjectsForGrade(g).map((s) => ({ code: s.code, name: s.name, color: s.color })) })),
  demoSchoolCode: isDemoSchoolCode ? SCHOOL_CODE : null,
})));

authRouter.post("/register", h(async (req) => {
  const ip = req.ip ?? "local";
  const r = registrations.get(ip);
  const now = Date.now();
  const cur = r && r.until > now ? r : { n: 0, until: now + 60 * 60_000 };
  if (cur.n >= 20) throw new HttpError(429, "Слишком много регистраций с этого устройства. Попробуйте через час");
  const body = parse(RegisterBody, req.body);
  const passwordHash = await bcrypt.hash(body.password, 10); // async — не блокирует event loop
  const id = body.role === "student" ? registerStudent({ ...body, passwordHash }) : registerTeacher({ ...body, passwordHash });
  registrations.set(ip, { n: cur.n + 1, until: cur.until });
  const u = get("SELECT id, role, short_name FROM users WHERE id = ?", id)!;
  return { token: signToken({ id: u.id, role: u.role, name: u.short_name }), user: profile(id) };
}));

authRouter.get("/me", authenticate, h((req) => profile(me(req).id)));

export function profile(id: number) {
  const u = get("SELECT id, login, role, full_name, short_name FROM users WHERE id = ?", id);
  if (!u) throw new HttpError(401, "Пользователь не найден");
  let cls = null;
  if (u.role === "student") {
    cls = get("SELECT c.id, c.name, c.grade FROM class_students cs JOIN classes c ON c.id = cs.class_id WHERE cs.student_id = ?", id) ?? null;
  } else {
    cls = get("SELECT id, name, grade FROM classes WHERE homeroom_teacher_id = ?", id) ?? null;
  }
  return {
    id: u.id,
    joinCode: u.role === "teacher" ? (get("SELECT join_code FROM classes WHERE homeroom_teacher_id = ?", id)?.join_code ?? null) : null,
    login: u.login,
    role: u.role,
    fullName: u.full_name,
    shortName: u.short_name,
    className: cls?.name ?? null,
    classId: cls?.id ?? null,
    grade: cls?.grade ?? null,
    school: SCHOOL_NAME,
    today: today(),
    ...publicLook(u.id),
  };
}
