/**
 * Учебный календарь 2026/2027 (Республика Беларусь, пятидневка).
 * Все даты — строки YYYY-MM-DD в локальном (минском) времени.
 */
export const YEAR_START = "2026-09-01";
export const YEAR_END = "2027-05-30";

export const QUARTERS = [
  { no: 1, from: "2026-09-01", to: "2026-10-24" },
  { no: 2, from: "2026-11-02", to: "2026-12-23" },
  { no: 3, from: "2027-01-12", to: "2027-03-20" },
  { no: 4, from: "2027-03-30", to: "2027-05-30" },
];

/** Каникулы и государственные праздники (нерабочие школьные дни). */
const HOLIDAY_RANGES: [string, string][] = [
  ["2026-10-25", "2026-11-01"], // осенние каникулы
  ["2026-11-07", "2026-11-07"], // День Октябрьской революции
  ["2026-12-24", "2027-01-11"], // зимние каникулы
  ["2027-03-21", "2027-03-29"], // весенние каникулы
];

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** 1 = понедельник … 7 = воскресенье */
export function weekday(s: string): number {
  const w = parseISO(s).getDay();
  return w === 0 ? 7 : w;
}

export function mondayOf(s: string): string {
  return addDays(s, 1 - weekday(s));
}

/** Сегодня. Для демо можно зафиксировать: KLASNA_TODAY=2026-11-05 */
export function today(): string {
  return process.env.KLASNA_TODAY ?? toISO(new Date());
}

export function isHoliday(s: string): boolean {
  return HOLIDAY_RANGES.some(([a, b]) => s >= a && s <= b);
}

export function isSchoolDay(s: string): boolean {
  return weekday(s) <= 5 && !isHoliday(s) && s >= YEAR_START && s <= YEAR_END;
}

export function quarterOf(s: string) {
  return QUARTERS.find((q) => s >= q.from && s <= q.to) ?? null;
}

/** Текущая или ближайшая прошедшая четверть */
export function currentQuarter(s = today()) {
  return quarterOf(s) ?? [...QUARTERS].reverse().find((q) => q.from <= s) ?? QUARTERS[0];
}

/** ISO-неделя как ключ (понедельник) */
export const weekKey = mondayOf;
