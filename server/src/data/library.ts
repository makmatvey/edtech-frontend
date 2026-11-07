/**
 * Каталог учебников 5–11 классов (учреждения общего среднего образования Республики Беларусь).
 * Для каждого предмета — классы, в которых он изучается. PDF лежат в materials/Учебники/<Предмет>/<класс>/.
 * Если в программе что-то поменяется — правится только этот список (from/to).
 */
import { SUBJECTS, TEXTBOOKS } from "./resources.js";

type Lang = "ru" | "be" | "en";
export type LibSubject = { code: string; name: string; color: string; from: number; to: number; lang: Lang };

const color = (code: string, fallback: string) => SUBJECTS.find((s) => s.code === code)?.color ?? fallback;

export const LIBRARY_SUBJECTS: LibSubject[] = [
  { code: "belarusian", name: "Беларуская мова", color: color("belarusian", "#B91C4B"), from: 5, to: 11, lang: "be" },
  { code: "literature_by", name: "Беларуская літаратура", color: "#9F1239", from: 5, to: 11, lang: "be" },
  { code: "russian", name: "Русский язык", color: color("russian", "#C2410C"), from: 5, to: 11, lang: "ru" },
  { code: "literature_ru", name: "Русская литература", color: "#B45309", from: 5, to: 11, lang: "ru" },
  { code: "english", name: "Английский язык", color: color("english", "#0E7C86"), from: 5, to: 11, lang: "en" },
  { code: "math", name: "Математика", color: color("math", "#2D5BE3"), from: 5, to: 6, lang: "ru" },
  { code: "algebra", name: "Алгебра", color: color("algebra", "#2D5BE3"), from: 7, to: 11, lang: "ru" },
  { code: "geometry", name: "Геометрия", color: color("geometry", "#6A4BD8"), from: 7, to: 11, lang: "ru" },
  { code: "informatics", name: "Информатика", color: "#0369A1", from: 6, to: 11, lang: "ru" },
  { code: "world_history", name: "Всемирная история", color: "#A16207", from: 5, to: 11, lang: "ru" },
  { code: "history_by", name: "История Беларуси", color: color("history_by", "#8A5A1F"), from: 6, to: 11, lang: "ru" },
  { code: "social", name: "Обществоведение", color: "#7C3AED", from: 9, to: 11, lang: "ru" },
  { code: "geography", name: "География", color: "#15803D", from: 6, to: 11, lang: "ru" },
  { code: "biology", name: "Биология", color: color("biology", "#2F8F4E"), from: 6, to: 11, lang: "ru" },
  { code: "physics", name: "Физика", color: color("physics", "#0F6CBD"), from: 7, to: 11, lang: "ru" },
  { code: "chemistry", name: "Химия", color: "#BE185D", from: 7, to: 11, lang: "ru" },
  { code: "art", name: "Искусство", color: "#BE185D", from: 5, to: 9, lang: "ru" },
  { code: "nature", name: "Человек и мир", color: "#15803D", from: 5, to: 5, lang: "ru" },
  { code: "drafting", name: "Черчение", color: "#475569", from: 10, to: 10, lang: "ru" },
  { code: "astronomy", name: "Астрономия", color: "#1E3A8A", from: 11, to: 11, lang: "ru" },
];

export const LIBRARY_GRADES = [5, 6, 7, 8, 9, 10, 11];

export type CatalogBook = {
  key: string; subject_code: string; subject: string; color: string; grade: number;
  title: string; authors: string | null; language: Lang;
};

/** Все учебники каталога: предмет × класс. Авторы — там, где они известны. */
export const CATALOG: CatalogBook[] = LIBRARY_SUBJECTS.flatMap((s) =>
  LIBRARY_GRADES.filter((g) => g >= s.from && g <= s.to).map((g) => ({
    key: `${s.code}-${g}`, subject_code: s.code, subject: s.name, color: s.color, grade: g,
    title: `${s.name}. ${g} ${s.lang === "be" ? "клас" : "класс"}`,
    authors: TEXTBOOKS.find((t) => t.subject === s.code && t.grade === g)?.authors ?? null,
    language: s.lang,
  })),
);
