/**
 * Журнал доступа к данным (audit_log): кто, когда и что сделал или посмотрел.
 *
 * Пишется:
 * - любое изменение (POST/PUT/PATCH/DELETE) — вход и регистрация, оценки, посещаемость, ДЗ, профиль, задания;
 * - любой просмотр учителем (GET /api/teacher/…) — журнал, карточки и отметки учеников, выгрузки;
 * - карточка одноклассника (GET /api/student/classmates/:id) — данные другого ученика;
 * - любой отказ в доступе (401/403) — попытки зайти куда нельзя.
 *
 * Не пишется: пароли, тела запросов, токены (адрес сохраняется без query-строки).
 * Хранится KLASNA_AUDIT_DAYS дней (по умолчанию 365). Выгрузка: `npm run audit -- 30` (CSV за 30 дней).
 */
import type { NextFunction, Request, Response } from "express";
import { all, migrate, run } from "./db.js";

const SENSITIVE_GET = [/^\/api\/teacher\//, /^\/api\/student\/classmates\//];

export function shouldAudit(method: string, apiPath: string, status: number) {
  if (status === 401 || status === 403) return true;
  if (method === "OPTIONS" || method === "HEAD") return false;
  if (method !== "GET") return true;
  return SENSITIVE_GET.some((r) => r.test(apiPath));
}

/** Express-middleware для /api: запись после ответа, когда известны пользователь и статус */
export function auditMiddleware(req: Request, res: Response, next: NextFunction) {
  res.on("finish", () => {
    const apiPath = req.originalUrl.split("?")[0].slice(0, 300);
    if (!shouldAudit(req.method, apiPath, res.statusCode)) return;
    const loginName = /^\/api\/auth\/(login|register)$/.test(apiPath) && typeof req.body?.login === "string" ? req.body.login.slice(0, 64) : null;
    try {
      run(
        "INSERT INTO audit_log (user_id, role, method, path, status, ip, login) VALUES (?,?,?,?,?,?,?)",
        req.user?.id ?? null, req.user?.role ?? null, req.method, apiPath, res.statusCode, (req.ip ?? "").slice(0, 64), loginName,
      );
    } catch (e) {
      console.error("audit_log: не удалось записать", e);
    }
  });
  next();
}

export function auditRetentionDays(env: NodeJS.ProcessEnv = process.env) {
  const n = Number(env.KLASNA_AUDIT_DAYS ?? 365);
  return Number.isInteger(n) && n > 0 ? n : 365;
}

/** Удаляет записи старше срока хранения */
export function pruneAudit(days = auditRetentionDays()) {
  return Number(run("DELETE FROM audit_log WHERE at < datetime('now', ?)", `-${days} days`).changes);
}

/** Чистка раз в сутки (таймер не держит процесс) */
export function scheduleAuditPrune() {
  pruneAudit();
  return setInterval(() => pruneAudit(), 24 * 3_600_000).unref();
}

export function auditRows(days = 7) {
  return all(
    `SELECT a.at, a.method, a.path, a.status, a.ip, a.role, COALESCE(u.login, a.login) AS login, u.full_name
       FROM audit_log a LEFT JOIN users u ON u.id = COALESCE(a.user_id, (SELECT id FROM users WHERE login = a.login))
      WHERE a.at >= datetime('now', ?) ORDER BY a.id`,
    `-${days} days`,
  );
}

if (process.argv[1] && /audit\.(ts|js)$/.test(process.argv[1])) {
  migrate();
  const days = Number(process.argv[2] ?? 7) || 7;
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  console.log("время (UTC);пользователь;ФИО;роль;метод;адрес;статус;IP");
  for (const r of auditRows(days)) console.log([r.at, r.login, r.full_name, r.role, r.method, r.path, r.status, r.ip].map(esc).join(";"));
}
