/**
 * Предметы и учебники. Сами файлы (PDF учебников, видео, пособия, аудио) лежат локально
 * в папке materials/ — см. services/materials.ts. Ссылок на сторонние сайты в интерфейсе нет.
 */
export const SUBJECTS = [
  { code: "math", name: "Математика", color: "#2D5BE3" },
  { code: "algebra", name: "Алгебра", color: "#2D5BE3" },
  { code: "geometry", name: "Геометрия", color: "#6A4BD8" },
  { code: "russian", name: "Русский язык", color: "#C2410C" },
  { code: "belarusian", name: "Беларуская мова", color: "#B91C4B" },
  { code: "english", name: "Английский язык", color: "#0E7C86" },
  { code: "physics", name: "Физика", color: "#0F6CBD" },
  { code: "history_by", name: "История Беларуси", color: "#8A5A1F" },
  { code: "biology", name: "Биология", color: "#2F8F4E" },
] as const;

export type SubjectCode = (typeof SUBJECTS)[number]["code"];

export const TEXTBOOKS: { subject: SubjectCode; grade: number; title: string; authors: string | null; language: string }[] = [
  { subject: "math", grade: 5, title: "Математика. 5 класс (в 2 частях)", authors: null, language: "ru" },
  { subject: "russian", grade: 5, title: "Русский язык. 5 класс", authors: null, language: "ru" },
  { subject: "belarusian", grade: 5, title: "Беларуская мова. 5 клас", authors: null, language: "be" },
  { subject: "english", grade: 5, title: "Английский язык. 5 класс (в 2 частях)", authors: null, language: "en" },
  { subject: "algebra", grade: 7, title: "Алгебра. 7 класс", authors: "И. Г. Арефьева, О. Н. Пирютко", language: "ru" },
  { subject: "geometry", grade: 7, title: "Геометрия. 7 класс", authors: "В. В. Казаков", language: "ru" },
  { subject: "russian", grade: 7, title: "Русский язык. 7 класс", authors: null, language: "ru" },
  { subject: "belarusian", grade: 7, title: "Беларуская мова. 7 клас", authors: null, language: "be" },
  { subject: "english", grade: 7, title: "Английский язык. 7 класс", authors: null, language: "en" },
  { subject: "physics", grade: 7, title: "Физика. 7 класс", authors: "Л. А. Исаченкова, Ю. Д. Лещинский", language: "ru" },
  { subject: "history_by", grade: 7, title: "История Беларуси. 7 класс", authors: null, language: "ru" },
  { subject: "biology", grade: 7, title: "Биология. 7 класс", authors: null, language: "ru" },
  { subject: "algebra", grade: 9, title: "Алгебра. 9 класс", authors: "И. Г. Арефьева, О. Н. Пирютко", language: "ru" },
  { subject: "geometry", grade: 9, title: "Геометрия. 9 класс", authors: "В. В. Казаков", language: "ru" },
  { subject: "russian", grade: 9, title: "Русский язык. 9 класс", authors: null, language: "ru" },
  { subject: "belarusian", grade: 9, title: "Беларуская мова. 9 клас", authors: null, language: "be" },
  { subject: "english", grade: 9, title: "Английский язык. 9 класс", authors: null, language: "en" },
  { subject: "physics", grade: 9, title: "Физика. 9 класс", authors: "Л. А. Исаченкова, А. А. Сокольский", language: "ru" },
  { subject: "history_by", grade: 9, title: "История Беларуси. 9 класс", authors: null, language: "ru" },
  { subject: "biology", grade: 9, title: "Биология. 9 класс", authors: null, language: "ru" },
];
