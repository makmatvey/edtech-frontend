import { all, get } from "../db.js";
import { YEAR_START, addDays, isSchoolDay, today, weekKey, mondayOf } from "../calendar.js";

/**
 * Правила стрика «Класны»:
 *  • день засчитывается только за учебное действие — пройденный «Квиз дня» (≥ 60 %)
 *    или самопроверку домашнего задания (≥ 60 %); простой вход не считается;
 *  • выходные и каникулы стрик не обрывают (но активность в эти дни засчитывается);
 *  • одна «заморозка» в неделю автоматически спасает пропущенный учебный день;
 *  • сегодняшний день, пока он не закончился, стрик не обрывает — он «под угрозой».
 */
export const PASS_RATIO = 0.6;
export const BADGES = [
  { id: "streak3", days: 3, title: "Разгон", hint: "3 дня подряд" },
  { id: "streak7", days: 7, title: "Неделя знаний", hint: "7 дней подряд" },
  { id: "streak14", days: 14, title: "Две недели", hint: "14 дней подряд" },
  { id: "streak30", days: 30, title: "Месяц без пропусков", hint: "30 дней подряд" },
];

export type DayStatus = "done" | "frozen" | "missed" | "off" | "today" | "future";

function doneSet(studentId: number, at: string) {
  const rows = all("SELECT date FROM streak_days WHERE student_id = ? AND date <= ? ORDER BY date", studentId, at);
  return new Set(rows.map((r) => r.date as string));
}

/** Длина стрика, заканчивающегося в день `end` (end включительно, если он выполнен). */
function streakEndingAt(done: Set<string>, end: string, allowPendingToday: boolean) {
  let count = 0;
  const freezes = new Set<string>();
  let d = end;
  if (done.has(d)) count++;
  else if (!allowPendingToday && isSchoolDay(d)) return { count: 0, freezesUsed: 0 };
  d = addDays(d, -1);
  while (d >= YEAR_START) {
    if (done.has(d)) count++;
    else if (isSchoolDay(d)) {
      const wk = weekKey(d);
      if (freezes.has(wk)) break;
      freezes.add(wk);
    }
    d = addDays(d, -1);
  }
  return { count, freezesUsed: freezes.size };
}

export function streakState(studentId: number, at = today()) {
  const done = doneSet(studentId, at);
  const current = streakEndingAt(done, at, true).count;
  let best = current;
  for (const d of done) best = Math.max(best, streakEndingAt(done, d, false).count);

  const todayDone = done.has(at);
  const xpRow = get("SELECT COALESCE(SUM(xp),0) AS xp FROM streak_days WHERE student_id = ?", studentId);
  const weekXpRow = get(
    "SELECT COALESCE(SUM(xp),0) AS xp FROM streak_days WHERE student_id = ? AND date >= ? AND date <= ?",
    studentId, mondayOf(at), at,
  );

  // Календарь: 5 недель, последняя — текущая
  const start = addDays(mondayOf(at), -28);
  const calendar: { date: string; status: DayStatus }[] = [];
  const weekFrozen = new Map<string, boolean>();
  for (let i = 0; i < 35; i++) {
    const d = addDays(start, i);
    let status: DayStatus;
    if (d > at) status = "future";
    else if (done.has(d)) status = "done";
    else if (d === at) status = isSchoolDay(d) ? "today" : "off";
    else if (!isSchoolDay(d)) status = "off";
    else {
      const wk = weekKey(d);
      if (!weekFrozen.get(wk) && current > 0 && d >= firstOfCurrentStreak(done, at)) {
        weekFrozen.set(wk, true);
        status = "frozen";
      } else status = "missed";
    }
    calendar.push({ date: d, status });
  }

  const freezeUsedThisWeek = calendar.some((c) => c.status === "frozen" && weekKey(c.date) === weekKey(at));
  return {
    current,
    best,
    todayDone,
    atRisk: !todayDone && isSchoolDay(at) && current > 0,
    freezeAvailable: !freezeUsedThisWeek,
    xp: Number(xpRow?.xp ?? 0),
    weekXp: Number(weekXpRow?.xp ?? 0),
    calendar,
    badges: BADGES.map((b) => ({ ...b, earned: best >= b.days })),
    nextBadge: BADGES.find((b) => current < b.days) ?? null,
  };
}

/** Первый день текущей серии — нужен, чтобы в календаре показывать заморозки только внутри серии. */
function firstOfCurrentStreak(done: Set<string>, at: string): string {
  let d = at;
  let first = at;
  const freezes = new Set<string>();
  if (!done.has(d) && !isSchoolDay(d)) {/* выходной — продолжаем */}
  d = addDays(d, -1);
  while (d >= YEAR_START) {
    if (done.has(d)) first = d;
    else if (isSchoolDay(d)) {
      const wk = weekKey(d);
      if (freezes.has(wk)) break;
      freezes.add(wk);
    }
    d = addDays(d, -1);
  }
  return first;
}

/** Компактный вариант для списков (рейтинг класса, кабинет учителя). */
export function streakBrief(studentId: number, at = today()) {
  const done = doneSet(studentId, at);
  const last = get("SELECT MAX(date) AS d FROM streak_days WHERE student_id = ? AND date <= ?", studentId, at);
  return {
    current: streakEndingAt(done, at, true).count,
    todayDone: done.has(at),
    lastActivity: (last?.d as string | null) ?? null,
  };
}
