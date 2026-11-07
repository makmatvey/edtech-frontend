/**
 * Импорт обложек учебников.
 *   npm run import-covers -w server -- "<папка или файл>"
 *
 * Понимает два источника:
 *  1) Страницы, сохранённые браузером («Сохранить как → Веб-страница полностью»):
 *     для каждой картинки берёт alt/title и текст рядом, находит предмет и класс.
 *  2) Просто картинки с понятными именами: «Алгебра 7.jpg», «Химия 11 класс.png».
 * Обложка копируется в materials/Учебники/<Предмет>/<класс>/обложка.<ext>.
 * Существующие обложки не перезаписываются (флаг --force — перезаписать).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CATALOG, LIBRARY_SUBJECTS } from "../src/data/library.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const MATERIALS = process.env.KLASNA_MATERIALS ?? path.resolve(here, "../../materials");
const args = process.argv.slice(2);
const force = args.includes("--force");
const src = args.find((a) => !a.startsWith("--"));
if (!src || !fs.existsSync(src)) {
  console.error("Укажите папку или файл: npm run import-covers -w server -- \"C:\\Users\\...\\Загрузки\\e-padruchnik\"");
  process.exit(1);
}

const IMG = /\.(jpe?g|png|webp)$/i;
const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[«»"'.,:;()]/g, " ").replace(/\s+/g, " ");
// Длинные названия проверяем раньше коротких («Беларуская літаратура» раньше «Беларуская мова»)
const NAMES: [string, string][] = [
  ...LIBRARY_SUBJECTS.map((s) => [norm(s.name), s.code] as [string, string]),
  ["белорусский язык", "belarusian"], ["белорусская литература", "literature_by"], ["беларуская литература", "literature_by"],
  ["литература", "literature_ru"], ["английский", "english"], ["english", "english"], ["история беларуси", "history_by"],
  ["гiсторыя беларусi", "history_by"], ["гісторыя беларусі", "history_by"], ["всемирная история", "world_history"],
  ["сусветная гісторыя", "world_history"], ["математика", "math"], ["алгебра", "algebra"], ["геометрия", "geometry"],
  ["физика", "physics"], ["химия", "chemistry"], ["биология", "biology"], ["география", "geography"], ["информатика", "informatics"],
  ["обществоведение", "social"], ["русский язык", "russian"], ["русская литература", "literature_ru"],
].sort((a, b) => b[0].length - a[0].length);

function detect(text: string): { code: string; grade: number } | null {
  const t = ` ${norm(text)} `;
  const hit = NAMES.find(([n]) => t.includes(n));
  const g = t.match(/(?:^|\s)(1[01]|[5-9])\s*(?:класс|клас|кл)?(?=\s|$)/);
  if (!hit || !g) return null;
  const grade = Number(g[1]);
  return CATALOG.some((b) => b.subject_code === hit[1] && b.grade === grade) ? { code: hit[1], grade } : null;
}

const done = new Map<string, string>();
const skipped: string[] = [];
function place(img: string, found: { code: string; grade: number }, why: string) {
  const book = CATALOG.find((b) => b.subject_code === found.code && b.grade === found.grade)!;
  if (done.has(book.key)) return;
  const dir = path.join(MATERIALS, "Учебники", book.subject, String(book.grade));
  fs.mkdirSync(dir, { recursive: true });
  const exists = fs.readdirSync(dir).find((f) => /^обложка\./i.test(f));
  if (exists && !force) { done.set(book.key, `${book.title}: уже есть ${exists}`); return; }
  if (exists) fs.rmSync(path.join(dir, exists));
  const dest = path.join(dir, `обложка${path.extname(img).toLowerCase().replace(".jpeg", ".jpg")}`);
  fs.copyFileSync(img, dest);
  done.set(book.key, `${book.title}  ←  ${path.basename(img)} (${why})`);
}

function fromHtml(file: string) {
  const html = fs.readFileSync(file, "utf8");
  const base = path.dirname(file);
  const tags = [...html.matchAll(/<img\b[^>]*>/gi)];
  const text = (a: number, b: number) => html.slice(Math.max(0, a), Math.max(0, b)).replace(/<[^>]+>/g, " ").slice(0, 600);
  tags.forEach((m, i) => {
    const tag = m[0];
    const attr = (n: string) => tag.match(new RegExp(`${n}\\s*=\\s*"([^"]*)"`, "i"))?.[1] ?? "";
    const s = decodeURI(attr("src") || attr("data-src")).split("?")[0];
    const img = path.resolve(base, s);
    if (!s || !IMG.test(s) || !fs.existsSync(img)) return;
    // Подпись карточки: alt/title, затем текст до следующей картинки, затем — после предыдущей
    const end = m.index! + tag.length;
    const after = text(end, tags[i + 1]?.index ?? end + 600);
    const before = text(i > 0 ? tags[i - 1].index! + tags[i - 1][0].length : m.index! - 300, m.index!);
    const found = detect(`${attr("alt")} ${attr("title")}`) ?? detect(after) ?? detect(before);
    if (found) place(img, found, "со страницы");
    else skipped.push(path.basename(img));
  });
}

function walk(p: string) {
  const st = fs.statSync(p);
  if (st.isDirectory()) { for (const f of fs.readdirSync(p)) walk(path.join(p, f)); return; }
  if (/\.html?$/i.test(p)) fromHtml(p);
}

// Сначала страницы, потом картинки с говорящими именами
walk(src);
const files: string[] = [];
const collect = (p: string) => fs.statSync(p).isDirectory() ? fs.readdirSync(p).forEach((f) => collect(path.join(p, f))) : IMG.test(p) && files.push(p);
collect(src);
for (const f of files) {
  const found = detect(path.basename(f).replace(IMG, ""));
  if (found) place(f, found, "по имени файла");
}

console.log(`Обложки: ${done.size} из ${CATALOG.length} учебников`);
for (const line of [...done.values()].sort()) console.log("  ✓ " + line);
const hasCover = (b: (typeof CATALOG)[number]) => {
  const dir = path.join(MATERIALS, "Учебники", b.subject, String(b.grade));
  return fs.existsSync(dir) && fs.readdirSync(dir).some((f) => /^обложка\./i.test(f));
};
const missing = CATALOG.filter((b) => !done.has(b.key) && !hasCover(b));
if (skipped.length) console.log(`Картинки без подписи предмета и класса (пропущены): ${skipped.length}`);
if (missing.length) console.log(`Без обложки (${missing.length}): ${missing.map((b) => `${b.subject} ${b.grade}`).join(", ")}`);
