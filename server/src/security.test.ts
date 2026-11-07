/**
 * Настройки безопасности сервера: JWT_SECRET, авто-демо в production, TRUST_PROXY, CORS_ORIGIN.
 * Своя временная база — data/klasna.db не трогается. Запуск: npm test.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Server } from "node:http";

const dbFile = path.join(os.tmpdir(), `klasna-sec-test-${process.pid}.db`);
const matDir = path.join(os.tmpdir(), `klasna-sec-materials-${process.pid}`);
process.env.KLASNA_DB = dbFile;
process.env.KLASNA_MATERIALS = matDir;
process.env.KLASNA_TODAY = "2026-11-05";
process.env.KLASNA_NOW = "10:40";
process.env.JWT_SECRET = "test-secret-for-security-tests-0123456789";
process.env.TRUST_PROXY = "1";
process.env.CORS_ORIGIN = "https://klasna.example, https://www.klasna.example/";

let server: Server;
let base = "";
let closeDb: () => void = () => {};

before(async () => {
  const { all, get, db } = await import("./db.js");
  closeDb = () => db.close();
  const { ensureDb } = await import("./ensure-db.js");
  const users = () => Number(get("SELECT COUNT(*) AS n FROM users")?.n ?? 0);

  // production + пустая база → демо-аккаунты с паролем «demo» сами не появляются
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  delete process.env.KLASNA_DEMO;
  ensureDb();
  assert.equal(users(), 0, "в production без KLASNA_DEMO=1 база не заполняется демо-данными");
  // …а с явным KLASNA_DEMO=1 — заполняется
  process.env.KLASNA_DEMO = "1";
  ensureDb();
  assert.ok(users() > 0, "KLASNA_DEMO=1 включает демо и в production");
  assert.ok(all("SELECT login FROM users WHERE login = 'teacher'").length === 1);
  if (prevEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prevEnv;
  delete process.env.KLASNA_DEMO;

  const { createApp } = await import("./app.js");
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

after(async () => {
  await new Promise((r) => server?.close(r));
  closeDb();
  for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) fs.rmSync(f, { force: true });
  fs.rmSync(matDir, { recursive: true, force: true });
});

test("JWT_SECRET: значения по умолчанию нет; production — только свой длинный секрет; dev — случайный, сохраняется", async () => {
  const { resolveJwtSecret } = await import("./auth.js");
  const dirA = path.join(os.tmpdir(), `klasna-jwt-${process.pid}`), dirB = path.join(os.tmpdir(), `klasna-jwt2-${process.pid}`);
  const file = path.join(dirA, ".jwt-secret");
  const long = "x".repeat(40);
  assert.throws(() => resolveJwtSecret({ NODE_ENV: "production" }, file), /JWT_SECRET/);
  assert.throws(() => resolveJwtSecret({ NODE_ENV: "production", JWT_SECRET: "   " }, file), /JWT_SECRET/);
  assert.throws(() => resolveJwtSecret({ NODE_ENV: "production", JWT_SECRET: "short-secret" }, file), /короткий/);
  assert.equal(resolveJwtSecret({ NODE_ENV: "production", JWT_SECRET: long }, file), long);
  assert.equal(fs.existsSync(file), false, "в production файл секрета не создаётся");
  const a = resolveJwtSecret({}, file);
  assert.ok(a.length >= 32, "сгенерирован длинный случайный секрет");
  assert.equal(resolveJwtSecret({ NODE_ENV: "development" }, file), a, "тот же секрет после перезапуска");
  assert.notEqual(resolveJwtSecret({}, path.join(dirB, ".jwt-secret")), a, "у другой установки — свой секрет");
  const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "auth.ts"), "utf8");
  assert.doesNotMatch(src, /change-me|dev-secret/i, "в коде нет секрета по умолчанию");
  fs.rmSync(dirA, { recursive: true, force: true });
  fs.rmSync(dirB, { recursive: true, force: true });
});

test("код школы: в production обязателен настоящий KLASNA_SCHOOL_CODE, демо-код — только для разработки", async () => {
  const { resolveSchoolCode, DEMO_SCHOOL_CODE } = await import("./services/registration.js");
  assert.throws(() => resolveSchoolCode({ NODE_ENV: "production" }), /KLASNA_SCHOOL_CODE/);
  assert.throws(() => resolveSchoolCode({ NODE_ENV: "production", KLASNA_SCHOOL_CODE: DEMO_SCHOOL_CODE }), /демо/);
  assert.throws(() => resolveSchoolCode({ NODE_ENV: "production", KLASNA_SCHOOL_CODE: "ab1" }), /короткий/);
  assert.equal(resolveSchoolCode({ NODE_ENV: "production", KLASNA_SCHOOL_CODE: "gym5-minsk" }), "GYM5-MINSK");
  assert.equal(resolveSchoolCode({ NODE_ENV: "production", KLASNA_DEMO: "1" }), DEMO_SCHOOL_CODE, "демо-стенд");
  assert.equal(resolveSchoolCode({}), DEMO_SCHOOL_CODE);
});

test("сервер в production без JWT_SECRET не запускается", () => {
  const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const tmpDb = path.join(os.tmpdir(), `klasna-sec-start-${process.pid}.db`);
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production", KLASNA_DB: tmpDb, PORT: "0", KLASNA_SCHOOL_CODE: "TEST-SCHOOL-1" };
  delete env.JWT_SECRET;
  const r = spawnSync(process.execPath, ["--import", "tsx", "--no-warnings", "src/index.ts"], { cwd: serverDir, env, encoding: "utf8", timeout: 30_000 });
  for (const f of [tmpDb, `${tmpDb}-wal`, `${tmpDb}-shm`]) fs.rmSync(f, { force: true });
  assert.notEqual(r.status, 0, "процесс завершился с ошибкой");
  assert.match(r.stderr, /JWT_SECRET/, r.stderr);
});

test("TRUST_PROXY: разбор значения", async () => {
  const { trustProxySetting } = await import("./app.js");
  assert.equal(trustProxySetting(undefined), false);
  assert.equal(trustProxySetting(""), false);
  assert.equal(trustProxySetting("false"), false);
  assert.equal(trustProxySetting("true"), true);
  assert.equal(trustProxySetting("2"), 2);
  assert.equal(trustProxySetting("loopback,10.0.0.0/8"), "loopback, 10.0.0.0/8");
});

test("TRUST_PROXY=1: лимит попыток входа считается по IP клиента из X-Forwarded-For", async () => {
  const attempt = (ip: string) => fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
    body: JSON.stringify({ login: "teacher", password: "wrong", role: "teacher" }),
  }).then((r) => r.status);
  for (let i = 0; i < 10; i++) assert.equal(await attempt("203.0.113.7"), 401);
  assert.equal(await attempt("203.0.113.7"), 429, "перебор с одного IP блокируется");
  assert.equal(await attempt("198.51.100.9"), 401, "другой клиент за тем же прокси не заблокирован");
});

test("CORS_ORIGIN: разрешены только указанные адреса", async () => {
  const { corsOrigins } = await import("./app.js");
  assert.equal(corsOrigins(undefined).length, 2, "по умолчанию — localhost и 127.0.0.1");
  const origin = async (o: string) => (await fetch(base + "/api/health", { headers: { Origin: o } })).headers.get("access-control-allow-origin");
  assert.equal(await origin("https://klasna.example"), "https://klasna.example");
  assert.equal(await origin("https://www.klasna.example"), "https://www.klasna.example", "слэш в конце настройки не мешает");
  assert.equal(await origin("https://evil.example"), null);
  assert.equal(await origin("http://localhost:5173"), null, "при заданном CORS_ORIGIN localhost не добавляется");
});

test("вход демо-паролем «demo» работает, хотя новые пароли должны быть длиннее", async () => {
  const r = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "192.0.2.1" },
    body: JSON.stringify({ login: "teacher", password: "demo", role: "teacher" }),
  });
  assert.equal(r.status, 200);
  const { token } = (await r.json()) as { token: string };
  assert.equal((await fetch(base + "/materials/nothing.pdf")).status, 401);
  assert.equal((await fetch(base + "/materials/nothing.pdf?token=" + encodeURIComponent(token))).status, 404, "с токеном — дальше, к поиску файла");
});
