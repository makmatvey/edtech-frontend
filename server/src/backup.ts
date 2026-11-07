/**
 * Резервные копии базы. Снимок делается средствами SQLite (VACUUM INTO) — целостная копия без остановки сервера.
 *
 * - вручную: `npm run backup` (в production — `npm run backup:prod`);
 * - по расписанию: каждые KLASNA_BACKUP_HOURS часов (в production по умолчанию 24, в разработке выключено);
 * - хранится KLASNA_BACKUP_KEEP последних копий (по умолчанию 14), старые удаляются;
 * - папка: KLASNA_BACKUP_DIR (по умолчанию data/backups рядом с базой).
 *
 * Восстановление: остановить сервер → скопировать нужный файл klasna-*.db на место data/klasna.db → запустить.
 */
import fs from "node:fs";
import path from "node:path";
import { DB_PATH, db } from "./db.js";

export const BACKUP_DIR = process.env.KLASNA_BACKUP_DIR ?? path.join(path.dirname(DB_PATH), "backups");
const PREFIX = "klasna-";

export function backupKeep(env: NodeJS.ProcessEnv = process.env) {
  const n = Number(env.KLASNA_BACKUP_KEEP ?? 14);
  return Number.isInteger(n) && n > 0 ? n : 14;
}

/** Часы между копиями; 0 — расписание выключено */
export function backupIntervalHours(env: NodeJS.ProcessEnv = process.env) {
  if (env.KLASNA_BACKUP_HOURS !== undefined) {
    const h = Number(env.KLASNA_BACKUP_HOURS);
    return Number.isFinite(h) && h > 0 ? h : 0;
  }
  return env.NODE_ENV === "production" ? 24 : 0;
}

/** Список копий: самые новые первыми */
export function listBackups(dir = BACKUP_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.startsWith(PREFIX) && f.endsWith(".db")).sort().reverse().map((f) => path.join(dir, f));
}

/** Делает снимок базы и удаляет лишние старые копии. Возвращает путь к новой копии. */
export function backupDb(dir = BACKUP_DIR, keep = backupKeep()) {
  fs.mkdirSync(dir, { recursive: true });
  // имя сортируется по времени: 2026-11-06T13-40-00-123; совпадение в ту же миллисекунду → _2, _3 (идут после)
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 23);
  let file = path.join(dir, `${PREFIX}${stamp}.db`);
  for (let i = 2; fs.existsSync(file); i++) file = path.join(dir, `${PREFIX}${stamp}_${i}.db`);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  for (const old of listBackups(dir).slice(keep)) fs.rmSync(old, { force: true });
  return file;
}

/** Копии по расписанию (таймеры не держат процесс) */
export function scheduleBackups(env: NodeJS.ProcessEnv = process.env) {
  const hours = backupIntervalHours(env);
  if (!hours) return null;
  const runOnce = () => {
    try {
      console.log(`Резервная копия базы: ${backupDb()}`);
    } catch (e) {
      console.error("Не удалось сделать резервную копию базы:", e);
    }
  };
  setTimeout(runOnce, 60_000).unref(); // первая — через минуту после запуска
  return setInterval(runOnce, hours * 3_600_000).unref();
}

if (process.argv[1] && /backup\.(ts|js)$/.test(process.argv[1])) {
  const file = backupDb();
  console.log(`Готово: ${file}\nКопий в ${BACKUP_DIR}: ${listBackups().length} (храним ${backupKeep()})`);
}
