/**
 * Локальная библиотека материалов. Файлы лежат в папке `materials/` в корне проекта,
 * сайт сам находит их и раскладывает по предметам и классам — по именам папок:
 *
 *   materials/<Раздел>/[<Предмет>]/[<класс>]/[<подпапка>]/файл
 *
 * Предмет — папка с названием предмета («Алгебра», «Английский язык»…), класс — папка «7» или «7 класс».
 * Любая другая папка становится категорией/подборкой (например «Интерактивные задания» или «Unit 3»).
 * Ничего не скачивается из интернета: сайт отдаёт только то, что лежит в папке.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TEXTBOOK_LINKS } from "../data/textbook-links.js";
import { SUBJECTS } from "../data/resources.js";
import { CATALOG, LIBRARY_SUBJECTS } from "../data/library.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const MATERIALS_DIR = process.env.KLASNA_MATERIALS ?? path.resolve(here, "../../../materials");
export const MATERIALS_URL = "/materials";

export type SectionKey = "textbooks" | "video" | "methods" | "audio";
export type FileKind = "pdf" | "video" | "audio" | "doc" | "slides" | "image";

export const SECTIONS: Record<SectionKey, { folder: string; title: string; source: string; exts: string[]; categories?: string[] }> = {
  textbooks: { folder: "Учебники", title: "Учебники", source: "e-padruchnik.adu.by", exts: ["pdf", "jpg", "jpeg", "png", "webp"] },
  video: { folder: "ЕИОР — Видеоуроки", title: "Видеоуроки", source: "ЕИОР", exts: ["mp4", "webm", "m4v", "ogv"] },
  methods: {
    folder: "Методика (profil.adu.by)", title: "Методика", source: "profil.adu.by", exts: ["pdf", "doc", "docx", "ppt", "pptx"],
    categories: ["Интерактивные задания", "Электронные курсы", "Советы по предметам", "Особые темы"],
  },
  audio: { folder: "Лингва — Аудио", title: "Аудио для языков", source: "Lingvo", exts: ["mp3", "m4a", "ogg", "wav", "aac"] },
};

const KIND: Record<string, FileKind> = {
  pdf: "pdf", mp4: "video", webm: "video", m4v: "video", ogv: "video",
  mp3: "audio", m4a: "audio", ogg: "audio", wav: "audio", aac: "audio",
  doc: "doc", docx: "doc", ppt: "slides", pptx: "slides", jpg: "image", jpeg: "image", png: "image",
};

export type Material = {
  id: string; section: SectionKey; title: string; url: string; ext: string; kind: FileKind; size: number;
  subject: { code: string; name: string; color: string } | null; grade: number | null; category: string | null;
  path: string; order: string;
};

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
const SUBJECT_BY_NAME = new Map<string, { code: string; name: string; color: string }>();
for (const s of LIBRARY_SUBJECTS) { SUBJECT_BY_NAME.set(norm(s.name), s); SUBJECT_BY_NAME.set(s.code, s); }
const ALIASES: Record<string, string> = {
  "белорусский язык": "belarusian", "белорусская литература": "literature_by", "беларуская литература": "literature_by",
  "литература": "literature_ru", "английский": "english", "история": "history_by", "всемирная": "world_history",
  "информатика и икт": "informatics",
};
for (const [alias, code] of Object.entries(ALIASES)) SUBJECT_BY_NAME.set(alias, LIBRARY_SUBJECTS.find((s) => s.code === code)!);

/** «01_Умножение-многочленов.pdf» → «Умножение многочленов» */
export function titleFromFile(name: string) {
  const base = name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return base.replace(/^\d{1,3}\s*[.)\-–—]?\s+(?=\S)/, "") || base;
}

const encodePath = (rel: string) => rel.split(path.sep).join("/").split("/").map(encodeURIComponent).join("/");

let cache: { at: number; items: Material[] } | null = null;

/** Все материалы (кэш на 5 секунд — новые файлы появляются на сайте почти сразу). */
export function allMaterials(): Material[] {
  if (cache && Date.now() - cache.at < 5000) return cache.items;
  const items: Material[] = [];
  for (const [key, sec] of Object.entries(SECTIONS) as [SectionKey, (typeof SECTIONS)[SectionKey]][]) {
    walk(path.join(MATERIALS_DIR, sec.folder), [], 0, (file, parts) => {
      const ext = path.extname(file).slice(1).toLowerCase();
      if (!sec.exts.includes(ext)) return;
      let subject: Material["subject"] = null, grade: number | null = null;
      const cats: string[] = [];
      for (const p of parts) {
        const s = SUBJECT_BY_NAME.get(norm(p));
        const g = /^(\d{1,2})(\s*(кл\.?|класс|клас))?$/i.exec(p.trim());
        if (s && !subject) subject = { code: s.code, name: s.name, color: s.color };
        else if (g && grade == null && +g[1] >= 1 && +g[1] <= 11) grade = +g[1];
        else cats.push(p);
      }
      const rel = path.relative(MATERIALS_DIR, file);
      const name = path.basename(file);
      items.push({
        id: Buffer.from(rel).toString("base64url"), section: key, title: titleFromFile(name),
        url: `${MATERIALS_URL}/${encodePath(rel)}`, ext, kind: KIND[ext] ?? "doc", size: fs.statSync(file).size,
        subject, grade, category: cats.length ? cats.join(" · ") : null, path: rel.split(path.sep).join("/"), order: name,
      });
    });
  }
  const coll = new Intl.Collator("ru", { numeric: true, sensitivity: "base" });
  items.sort((a, b) => coll.compare(a.path, b.path));
  cache = { at: Date.now(), items };
  return items;
}

function walk(dir: string, parts: string[], depth: number, onFile: (file: string, parts: string[]) => void) {
  if (depth > 5) return;
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name.startsWith("~$")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, [...parts, e.name], depth + 1, onFile);
    else if (e.isFile()) onFile(full, parts);
  }
}

export function materialsIn(section: SectionKey, f: { subject?: string | null; grade?: number | null } = {}) {
  return allMaterials().filter((m) => m.section === section
    && (!f.subject || !m.subject || m.subject.code === f.subject)
    && (f.grade == null || m.grade == null || m.grade === f.grade));
}

/** PDF учебника для предмета и класса: Учебники/<Предмет>/<класс>/*.pdf (если частей несколько — все по порядку) */
export function textbookFiles(subjectCode: string, grade: number) {
  return allMaterials().filter((m) => m.section === "textbooks" && m.kind === "pdf" && m.subject?.code === subjectCode && m.grade === grade);
}

/** Обложка учебника: картинка в его папке (файл с «обложка» в имени — в приоритете) */
export function textbookCover(subjectCode: string, grade: number) {
  const imgs = allMaterials().filter((m) => m.section === "textbooks" && m.kind === "image" && m.subject?.code === subjectCode && m.grade === grade);
  return (imgs.find((m) => /облож|cover/i.test(m.title)) ?? imgs[0])?.url ?? null;
}
export const textbookFile = (subjectCode: string, grade: number) => textbookFiles(subjectCode, grade)[0] ?? null;

/** Части существуют только при наличии нескольких файлов. */
export function textbookParts(files: ReturnType<typeof textbookFiles>, grade: number, _language: string) {
  if (grade >= 10 || files.length < 2) return [];
  return files.map((f) => ({ title: f.title, url: f.url }));
}

/** Ссылки каталога имеют приоритет над локальными демо-файлами. */
export function bookWithFiles(b: (typeof CATALOG)[number]) {
  const links = b.grade < 10 ? TEXTBOOK_LINKS[b.key] : undefined;
  const files = b.grade < 10 ? textbookFiles(b.subject_code, b.grade) : [];
  return {
    ...b,
    url: links?.[0]?.url ?? files[0]?.url ?? null,
    cover: textbookCover(b.subject_code, b.grade),
    parts: links ? (links.length > 1 ? links : []) : textbookParts(files, b.grade, b.language),
  };
}

/** Материалы к конкретному уроку: видео и аудио по предмету и классу, методички по предмету. */
export function materialsForLesson(subjectCode: string, grade: number) {
  const pick = (s: SectionKey) => allMaterials().filter((m) => m.section === s && m.subject?.code === subjectCode && (m.grade == null || m.grade === grade));
  return [...pick("video"), ...pick("audio"), ...pick("methods")];
}

export function sectionsSummary() {
  const all = allMaterials();
  return (Object.keys(SECTIONS) as SectionKey[]).map((k) => ({
    key: k, title: SECTIONS[k].title, source: SECTIONS[k].source, folder: SECTIONS[k].folder,
    count: all.filter((m) => m.section === k && !(k === "textbooks" && m.kind === "image")).length,
  }));
}

/** Создаёт пустую структуру папок, чтобы было понятно, куда класть файлы. */
export function ensureMaterialFolders() {
  const mk = (...p: string[]) => fs.mkdirSync(path.join(MATERIALS_DIR, ...p), { recursive: true });
  // Учебники: каждый учебник каталога 5–11 классов — своя папка
  for (const b of CATALOG) mk(SECTIONS.textbooks.folder, b.subject, String(b.grade));
  // Видео: предметы, которые ведутся на сайте, по классам из каталога
  const siteSubjects = LIBRARY_SUBJECTS.filter((s) => SUBJECTS.some((x) => x.code === s.code));
  for (const s of siteSubjects) for (let g = s.from; g <= s.to; g++) mk(SECTIONS.video.folder, s.name, String(g));
  for (const c of SECTIONS.methods.categories!) mk(SECTIONS.methods.folder, c);
  for (const s of LIBRARY_SUBJECTS) mk(SECTIONS.methods.folder, "Советы по предметам", s.name);
  for (const lang of ["Английский язык", "Русский язык", "Беларуская мова"]) for (let g = 5; g <= 11; g++) mk(SECTIONS.audio.folder, lang, String(g));
}

/**
 * Если в архиве нет медиафайлов — кладём лёгкие демо-образцы, чтобы библиотека
 * открывалась из браузера на защите (реальные PDF/видео подкладываются отдельно).
 */
export function ensureDemoMaterials() {
  cache = null;
  const hasMedia = allMaterials().some((m) => m.kind === "pdf" || m.kind === "video" || m.kind === "audio");
  if (hasMedia) return;
  const DEMO: Record<string, string> = {
    "Учебники/Алгебра/7/Алгебра 7.pdf": "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\nДемо-учебник «Алгебра 7» для Класны.\n",
    "Учебники/Математика/5/Математика 5.pdf": "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\nДемо-учебник «Математика 5».\n",
    "Учебники/Алгебра/11/Алгебра 11.pdf": "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\nДемо-учебник «Алгебра 11» (подготовка к ЦТ/ЦЭ).\n",
    "ЕИОР — Видеоуроки/Алгебра/7/02_Умножение многочленов.mp4": "ftypisomdemo-video-klasna",
    "ЕИОР — Видеоуроки/Физика/9/Сила трения.mp4": "ftypisomdemo-video-klasna",
    "Методика (profil.adu.by)/Интерактивные задания/Как создать задание.pdf": "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\nДемо-методичка.\n",
    "Лингва — Аудио/Английский язык/7/Unit 3/01_Dialogue.mp3": "ID3demo-audio-klasna",
    "Лингва — Аудио/Английский язык/9/Listening.mp3": "ID3demo-audio-klasna",
  };
  for (const [rel, body] of Object.entries(DEMO)) {
    const full = path.join(MATERIALS_DIR, rel);
    if (fs.existsSync(full)) continue;
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  cache = null;
}
