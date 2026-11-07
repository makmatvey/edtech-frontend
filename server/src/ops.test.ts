/**
 * Эксплуатация: резервные копии базы, журнал доступа к данным, обязательный код школы в production.
 * Отдельная временная база — data/klasna.db не трогается.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import type { Server } from "node:http";

const dbFile = path.join(os.tmpdir(), `klasna-ops-test-${process.pid}.db`);
process.env.KLASNA_DB = dbFile;
process.env.KLASNA_TODAY = "2026-11-05";
process.env.KLASNA_NOW = "10:40";
const matDir = path.join(os.tmpdir(), `klasna-ops-materials-${process.pid}`);
fs.mkdirSync(matDir, { recursive: true });
process.env.KLASNA_MATERIALS = matDir;
const backupDir = path.join(os.tmpdir(), `klasna-ops-backups-${process.pid}`);

let server: Server;
let base = "";
let db: typeof import("./db.js");

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(base + url, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}
const audit = () => db.all("SELECT * FROM audit_log ORDER BY id");
const settle = () => new Promise((r) => setTimeout(r, 50)); // запись журнала — после ответа

before(async () => {
  db = await import("./db.js");
  db.migrate();
  const { seed } = await import("./seed.js");
  seed();
  const { createApp } = await import("./app.js");
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

after(async () => {
  await new Promise((r) => server?.close(r));
  db.db.close();
  for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) fs.rmSync(f, { force: true });
  fs.rmSync(matDir, { recursive: true, force: true });
  fs.rmSync(backupDir, { recursive: true, force: true });
});

test("резервная копия: целостный снимок базы, лишние старые удаляются", async () => {
  const { backupDb, listBackups, backupIntervalHours } = await import("./backup.js");
  const users = Number(db.get("SELECT COUNT(*) AS n FROM users")!.n);
  const files = [backupDb(backupDir, 3), backupDb(backupDir, 3), backupDb(backupDir, 3), backupDb(backupDir, 3)];
  assert.equal(listBackups(backupDir).length, 3, "храним только 3 последних");
  assert.ok(!fs.existsSync(files[0]), "самая старая удалена");
  const copy = new DatabaseSync(files[3], { readOnly: true });
  assert.equal(Number((copy.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n), users, "в копии те же пользователи");
  assert.equal((copy.prepare("PRAGMA integrity_check").get() as Record<string, string>).integrity_check, "ok");
  copy.close();
  assert.equal(backupIntervalHours({ NODE_ENV: "production" }), 24, "в production — раз в сутки по умолчанию");
  assert.equal(backupIntervalHours({}), 0, "в разработке выключено");
  assert.equal(backupIntervalHours({ KLASNA_BACKUP_HOURS: "6" }), 6);
});

test("журнал доступа: входы, изменения, просмотры учителем и отказы — без паролей и токенов", async () => {
  db.run("DELETE FROM audit_log");
  const bad = await call("POST", "/api/auth/login", undefined, { login: "teacher", password: "wrong-pass", role: "teacher" });
  assert.equal(bad.status, 401);
  const ok = await call("POST", "/api/auth/login", undefined, { login: "teacher", password: "demo", role: "teacher" });
  const st = await call("POST", "/api/auth/login", undefined, { login: "student", password: "demo", role: "student" });
  const teacher = ok.json.token as string, student = st.json.token as string;
  await call("GET", "/api/teacher/dashboard?x=1", teacher);
  await call("GET", "/api/student/overview", student); // свои данные — не пишем
  await call("GET", "/api/teacher/dashboard", student); // ученик лезет к учителю — отказ пишем
  await settle();
  const rows = audit();
  const logins = rows.filter((r) => r.path === "/api/auth/login");
  assert.deepEqual(logins.map((r) => [r.login, r.status]), [["teacher", 401], ["teacher", 200], ["student", 200]], "входы, в том числе неудачный");
  const view = rows.find((r) => r.path === "/api/teacher/dashboard" && r.status === 200);
  assert.ok(view, "просмотр учителем записан");
  assert.equal(view.user_id, db.get("SELECT id FROM users WHERE login = 'teacher'")!.id);
  assert.equal(view.role, "teacher");
  assert.ok(!rows.some((r) => r.path === "/api/student/overview"), "просмотр своих данных учеником не пишем");
  assert.ok(rows.some((r) => r.path === "/api/teacher/dashboard" && r.status === 403), "отказ в доступе записан");
  const dump = JSON.stringify(rows);
  assert.doesNotMatch(dump, /demo|wrong-pass/, "паролей в журнале нет");
  assert.doesNotMatch(dump, /\?x=1|eyJ/, "query-строки и токенов в журнале нет");
});

test("журнал доступа: старые записи удаляются по сроку хранения", async () => {
  const { pruneAudit } = await import("./audit.js");
  db.run("INSERT INTO audit_log (at, method, path, status) VALUES (datetime('now', '-400 days'), 'GET', '/api/teacher/old', 200)");
  db.run("INSERT INTO audit_log (at, method, path, status) VALUES (datetime('now', '-10 days'), 'GET', '/api/teacher/recent', 200)");
  assert.equal(pruneAudit(365), 1);
  assert.ok(!audit().some((r) => r.path === "/api/teacher/old"));
  assert.ok(audit().some((r) => r.path === "/api/teacher/recent"));
});

test("сервер в production без KLASNA_SCHOOL_CODE не запускается", () => {
  const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const tmpDb = path.join(os.tmpdir(), `klasna-ops-start-${process.pid}.db`);
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", KLASNA_DB: tmpDb, PORT: "0", JWT_SECRET: "y".repeat(48) };
  delete env.KLASNA_SCHOOL_CODE;
  delete env.KLASNA_DEMO;
  const r = spawnSync(process.execPath, ["--import", "tsx", "--no-warnings", "src/index.ts"], { cwd: serverDir, env, encoding: "utf8", timeout: 30_000 });
  for (const f of [tmpDb, `${tmpDb}-wal`, `${tmpDb}-shm`]) fs.rmSync(f, { force: true });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /KLASNA_SCHOOL_CODE/, r.stderr);
});
