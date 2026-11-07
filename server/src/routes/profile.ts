import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { get, run } from "../db.js";
import { authenticate, me } from "../auth.js";
import { HttpError, h, parse } from "../http.js";
import { passwordRule } from "./auth.js";
import { MAX_SHOWCASE, achievementsFor, backgroundsFor, framesFor, publicLook, studentStats } from "../services/profile.js";

/** Профиль и настройки — для учителей и учеников */
export const profileRouter = Router();
profileRouter.use(authenticate);

/** Картинка уже уменьшена в браузере до 192×192, поэтому лимит небольшой */
const AVATAR_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_AVATAR = 120_000;

profileRouter.get("/", h((req) => {
  const u = me(req);
  const look = publicLook(u.id);
  if (u.role !== "student") return { ...look, achievements: [], frames: [], backgrounds: [] };
  const s = studentStats(u.id);
  return {
    ...look,
    stats: { best: s.best, tasks: s.tasks, hwDone: s.hwDone, checks: s.checks, exams: s.exams, avg: s.avg, xp: s.xp },
    achievements: achievementsFor(s),
    frames: framesFor(s),
    backgrounds: backgroundsFor(s),
    maxShowcase: MAX_SHOWCASE,
  };
}));

const Patch = z.object({
  avatar: z.string().max(MAX_AVATAR, "Фото слишком большое").regex(AVATAR_RE, "Нужна картинка PNG, JPEG или WebP").nullable().optional(),
  frame: z.string().max(20).nullable().optional(),
  background: z.string().max(20).nullable().optional(),
  showcase: z.array(z.string().max(20)).max(MAX_SHOWCASE, `На витрине не больше ${MAX_SHOWCASE} достижений`).optional(),
});

profileRouter.put("/", h((req) => {
  const u = me(req);
  const body = parse(Patch, req.body);
  const studentOnly = body.frame != null || body.background != null || body.showcase !== undefined;
  if (studentOnly && u.role !== "student") throw new HttpError(400, "Рамки, фоны и витрина достижений доступны ученикам");
  const s = studentOnly ? studentStats(u.id) : null;

  if (body.frame != null) {
    const f = framesFor(s!).find((x) => x.id === body.frame);
    if (!f) throw new HttpError(400, "Такой рамки нет");
    if (!f.unlocked) throw new HttpError(400, `Рамка «${f.title}» ещё закрыта: ${f.hint.toLowerCase()}`);
  }
  if (body.background != null) {
    const b = backgroundsFor(s!).find((x) => x.id === body.background);
    if (!b) throw new HttpError(400, "Такого фона нет");
    if (!b.unlocked) throw new HttpError(400, `Фон «${b.title}» откроется после ${b.target} выполненных заданий`);
  }
  let showcase: string[] | undefined;
  if (body.showcase !== undefined) {
    const earned = new Set(achievementsFor(s!).filter((a) => a.earned).map((a) => a.id));
    showcase = [...new Set(body.showcase)];
    if (showcase.some((id) => !earned.has(id))) throw new HttpError(400, "На витрину можно поставить только полученные достижения");
  }

  if (body.avatar !== undefined) run("UPDATE users SET avatar = ? WHERE id = ?", body.avatar, u.id);
  if (body.frame !== undefined) run("UPDATE users SET frame = ? WHERE id = ?", body.frame, u.id);
  if (body.background !== undefined) run("UPDATE users SET background = ? WHERE id = ?", body.background, u.id);
  if (showcase) run("UPDATE users SET showcase = ? WHERE id = ?", JSON.stringify(showcase), u.id);
  return publicLook(u.id);
}));

const PasswordBody = z.object({
  current: z.string().min(1, "Введите текущий пароль").max(128),
  next: passwordRule,
});

profileRouter.put("/password", h(async (req) => {
  const u = me(req);
  const body = parse(PasswordBody, req.body);
  const row = get("SELECT password_hash FROM users WHERE id = ?", u.id);
  if (!row || !(await bcrypt.compare(body.current, row.password_hash as string))) throw new HttpError(400, "Текущий пароль неверный");
  if (body.current === body.next) throw new HttpError(400, "Новый пароль совпадает с текущим");
  run("UPDATE users SET password_hash = ? WHERE id = ?", await bcrypt.hash(body.next, 10), u.id);
  return { ok: true };
}));
