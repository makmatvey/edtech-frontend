const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const WD_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

export const parseDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const addDays = (s: string, n: number) => { const d = parseDate(s); d.setDate(d.getDate() + n); return toISO(d); };

export const fmtDay = (s: string) => { const d = parseDate(s); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
export const fmtDayShort = (s: string) => { const d = parseDate(s); return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`; };
export const fmtNum = (s: string) => { const d = parseDate(s); return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`; };
export const weekdayName = (s: string) => WEEKDAYS[parseDate(s).getDay()];
export const weekdayShort = (s: string) => WD_SHORT[parseDate(s).getDay()];
export const fmtLong = (s: string) => { const w = weekdayName(s); return `${w[0].toUpperCase()}${w.slice(1)}, ${fmtDay(s)}`; };

export function relDay(s: string, today: string) {
  if (s === today) return "сегодня";
  if (s === addDays(today, 1)) return "завтра";
  if (s === addDays(today, -1)) return "вчера";
  return `${weekdayShort(s).toLowerCase()}, ${fmtDayShort(s)}`;
}

export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
export const days = (n: number) => `${n} ${plural(n, "день", "дня", "дней")}`;
export const lessonsWord = (n: number) => `${n} ${plural(n, "урок", "урока", "уроков")}`;

export const fmtAvg = (v: number | null | undefined, digits = 1) => (v == null ? "—" : v.toFixed(digits).replace(".", ","));
export const fmtPct = (v: number | null | undefined) => (v == null ? "—" : `${String(v).replace(".", ",")} %`);

export const GRADE_KIND: Record<string, string> = {
  answer: "Ответ на уроке",
  independent: "Самостоятельная работа",
  control: "Контрольная работа",
  homework: "Домашняя работа",
};
export const ATT_LABEL: Record<string, string> = { present: "Был", absent: "Н", excused: "Ув", late: "Оп" };
export const ATT_FULL: Record<string, string> = { present: "Присутствовал", absent: "Отсутствовал без причины", excused: "Отсутствовал по уважительной причине", late: "Опоздал" };

/** Цвет оценки по 10-балльной шкале РБ */
export const gradeTone = (v: number | null) => (v == null ? "" : v >= 9 ? "good" : v >= 6 ? "" : v >= 4 ? "warn" : "bad");

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}
const AV_COLORS = ["#2140c4", "#6a4bd8", "#0e7c86", "#c2410c", "#277a43", "#b91c4b", "#8a5a1f", "#0f6cbd"];
export const avatarColor = (id: number) => AV_COLORS[id % AV_COLORS.length];
