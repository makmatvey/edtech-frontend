import type { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import jwt from "jsonwebtoken";
import { DB_PATH } from "./db.js";
import { HttpError } from "./http.js";

/** Минимальная длина секрета в production: 32 символа ≈ 192 бита для случайной строки */
export const MIN_SECRET_LENGTH = 32;

/**
 * Секрет для подписи токенов. Значения по умолчанию в коде нет — подделать токен по известному секрету нельзя.
 * - JWT_SECRET задан → используется он (в production — не короче 32 символов);
 * - production без JWT_SECRET → сервер не стартует;
 * - разработка без JWT_SECRET → случайный секрет генерируется один раз и хранится рядом с базой (.jwt-secret, в git не попадает).
 */
export function resolveJwtSecret(env: NodeJS.ProcessEnv = process.env, secretFile = path.join(path.dirname(DB_PATH), ".jwt-secret")): string {
  const s = env.JWT_SECRET?.trim();
  if (env.NODE_ENV === "production") {
    if (!s) throw new Error("JWT_SECRET не задан. В production задайте длинный случайный JWT_SECRET в окружении (например: openssl rand -base64 48) — без него сервер не запускается.");
    if (s.length < MIN_SECRET_LENGTH) throw new Error(`JWT_SECRET слишком короткий (${s.length} символов) — нужно не меньше ${MIN_SECRET_LENGTH}. Сгенерируйте: openssl rand -base64 48`);
    return s;
  }
  if (s) return s;
  try {
    const saved = fs.readFileSync(secretFile, "utf8").trim();
    if (saved.length >= MIN_SECRET_LENGTH) return saved;
  } catch { /* файла ещё нет */ }
  const fresh = crypto.randomBytes(48).toString("base64url");
  fs.mkdirSync(path.dirname(secretFile), { recursive: true });
  fs.writeFileSync(secretFile, fresh, { mode: 0o600 });
  return fresh;
}

const SECRET = resolveJwtSecret();
const TTL = "12h";

export type Role = "student" | "teacher";
export type AuthUser = { id: number; role: Role; name: string };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const signToken = (u: AuthUser) => jwt.sign(u, SECRET, { expiresIn: TTL });

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  verifyInto(req, token, next);
}

/**
 * Для файлов из materials/: <a href>, <video>, <img>, <iframe> не умеют слать заголовок Authorization,
 * поэтому токен принимается и из параметра ?token= (только здесь, не для /api).
 */
export function authenticateFile(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const q = req.query.token;
  const token = header.startsWith("Bearer ") ? header.slice(7) : typeof q === "string" && q ? q : null;
  verifyInto(req, token, next);
}

function verifyInto(req: Request, token: string | null, next: NextFunction) {
  if (!token) return next(new HttpError(401, "Войдите в систему"));
  try {
    const p = jwt.verify(token, SECRET) as AuthUser;
    req.user = { id: p.id, role: p.role, name: p.name };
    next();
  } catch {
    next(new HttpError(401, "Сессия истекла — войдите снова"));
  }
}

export const requireRole =
  (role: Role) => (req: Request, _res: Response, next: NextFunction) =>
    req.user?.role === role ? next() : next(new HttpError(403, "Недостаточно прав для этого раздела"));

export const me = (req: Request): AuthUser => {
  if (!req.user) throw new HttpError(401, "Войдите в систему");
  return req.user;
};
