import { getToken } from "./api";

export type FileKind ="pdf" | "video" | "audio" | "doc" | "slides" | "image";

export type Material = {
  id: string; section: string; title: string; url: string; ext: string; kind: FileKind; size: number;
  subject: { code: string; name: string; color: string } | null; grade: number | null; category: string | null;
  path: string;
};

export type MaterialsResp = {
  section: { key: string; title: string; source: string; folder: string; exts: string[]; categories?: string[] };
  items: Material[];
  mine: { subjects: string[]; grades: number[] };
};

export type Textbook = {
  key: string; title: string; authors: string | null; language: string; grade: number;
  subject_code: string; subject: string; color: string; url: string | null; cover: string | null; parts: { title: string; url: string | null }[];
};
export type LibraryResp = { textbooks: Textbook[]; mine: { subjects: string[]; grades: number[] } };

export const KIND_LABEL: Record<FileKind, string> = {
  pdf: "PDF", video: "Видео", audio: "Аудио", doc: "Документ Word", slides: "Презентация", image: "Изображение",
};

export function fmtSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0).replace(".", ",")} МБ`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1).replace(".", ",")} ГБ`;
}

export function fmtTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec % 60), m = Math.floor(sec / 60) % 60, h = Math.floor(sec / 3600);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export const gradeLabel = (g: number | null) => (g == null ? "все классы" : `${g} класс`);

/** Одна функция склонения на весь клиент — из format.ts (реэкспорт для старых импортов) */
export { plural } from "./format";

/**
 * Адрес файла из папки materials для <img>, <video>, <audio>, <iframe> и ссылок «Скачать».
 * Сервер отдаёт материалы только вошедшим, а эти теги не умеют слать заголовок Authorization —
 * поэтому токен входа добавляется параметром ?token=.
 */
export function fileUrl(url: string) {
  const token = getToken();
  if (!token || !url.startsWith("/materials/")) return url;
  const [path, hash] = url.split("#");
  return `${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}${hash != null ? `#${hash}` : ""}`;
}
