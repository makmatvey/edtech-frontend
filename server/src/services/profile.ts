/**
 * Профиль ученика: достижения (на витрину — до трёх), рамки аватарки за отметки четверти
 * и фоны профиля за выполненные задания. Всё считается из реальных данных — подделать через API нельзя.
 * Простых достижений — пара штук, остальные требуют усилий (например, три «10» за один день).
 */
import { all, get } from "../db.js";
import { currentQuarter, mondayOf, today } from "../calendar.js";
import { streakState } from "./streak.js";

export const MAX_SHOWCASE = 3;

/** Показатели ученика, из которых открываются достижения, рамки и фоны */
export function studentStats(studentId: number, at = today()) {
  const q = currentQuarter(at);
  const s = streakState(studentId, at);
  const attempts = all(
    "SELECT mode, score, total, passed, date FROM quiz_attempts WHERE student_id = ? AND submitted_at IS NOT NULL ORDER BY date, id",
    studentId,
  );
  const daily = attempts.filter((a) => a.mode === "daily");
  // Самая длинная цепочка квизов дня без единой ошибки подряд
  let run = 0, perfectRun = 0;
  for (const a of daily) { run = a.score === a.total ? run + 1 : 0; perfectRun = Math.max(perfectRun, run); }
  const exams = attempts.filter((a) => a.mode === "exam" && a.passed);
  const hwDone = Number(get("SELECT COUNT(*) AS n FROM homework_done WHERE student_id = ?", studentId)?.n ?? 0);
  const checks = attempts.filter((a) => a.mode === "homework" && a.passed).length;

  const allGrades = all(
    `SELECT g.value, l.date, ta.subject_id FROM grades g JOIN lessons l ON l.id = g.lesson_id JOIN teacher_assignments ta ON ta.id = l.assignment_id
      WHERE g.student_id = ? AND l.date <= ? ORDER BY l.date, l.lesson_no`,
    studentId, at,
  ).map((r) => ({ value: Number(r.value), date: String(r.date), subject: Number(r.subject_id) }));
  const quarter = allGrades.filter((g) => g.date >= q.from);
  const qv = quarter.map((g) => g.value);
  const avg = qv.length ? qv.reduce((a, b) => a + b, 0) / qv.length : 0;
  const maxBy = (key: (g: { date: string }) => string) => {
    const m = new Map<string, number>();
    for (const g of allGrades) if (g.value === 10) m.set(key(g), (m.get(key(g)) ?? 0) + 1);
    return Math.max(0, ...m.values());
  };
  // Камбэк: после отметки 4 и ниже — 9 или 10 по тому же предмету
  const low = new Set<number>();
  let comeback = 0;
  for (const g of allGrades) { if (g.value <= 4) low.add(g.subject); else if (g.value >= 9 && low.has(g.subject)) comeback = 1; }
  // Средний по каждому предмету четверти (учитываем предметы, где 3+ отметки)
  const bySubj = new Map<number, number[]>();
  for (const g of quarter) bySubj.set(g.subject, [...(bySubj.get(g.subject) ?? []), g.value]);
  const subjAvgs = [...bySubj.values()].filter((v) => v.length >= 3).map((v) => v.reduce((a, b) => a + b, 0) / v.length);
  const att = get(
    `SELECT COUNT(*) AS total, SUM(a.status = 'absent') AS absent FROM attendance a JOIN lessons l ON l.id = a.lesson_id
      WHERE a.student_id = ? AND l.date BETWEEN ? AND ?`,
    studentId, q.from, at,
  );
  // Лидер класса: 1-е место по опыту за эту неделю
  const cls = get("SELECT c.id, c.grade FROM class_students cs JOIN classes c ON c.id = cs.class_id WHERE cs.student_id = ?", studentId);
  const week = all(
    `SELECT sd.student_id, SUM(sd.xp) AS xp FROM streak_days sd JOIN class_students cs ON cs.student_id = sd.student_id
      WHERE cs.class_id = ? AND sd.date BETWEEN ? AND ? GROUP BY sd.student_id ORDER BY xp DESC`,
    cls?.id ?? 0, mondayOf(at), at,
  );
  const leader = week.length > 0 && week[0].student_id === studentId && (week.length < 2 || Number(week[0].xp) > Number(week[1].xp)) ? 1 : 0;

  return {
    best: s.best,
    xp: s.xp,
    daily: daily.filter((a) => a.passed).length,
    perfect: daily.filter((a) => a.score === a.total).length,
    perfectRun,
    checks,
    exams: exams.length,
    exam90: exams.filter((a) => a.total && a.score / a.total >= 0.9).length,
    hwDone,
    /** «Задания» — отмеченные ДЗ, пройденные самопроверки и варианты ЦТ/ЦЭ */
    tasks: hwDone + checks + exams.length,
    avg: Math.round(avg * 100) / 100,
    count: qv.length,
    min: qv.length ? Math.min(...qv) : 0,
    tens: qv.filter((v) => v === 10).length,
    nines: qv.filter((v) => v >= 9).length,
    eights: qv.filter((v) => v >= 8).length,
    tensEver: allGrades.filter((g) => g.value === 10).length,
    tensDayMax: maxBy((g) => g.date),
    tensWeekMax: maxBy((g) => mondayOf(g.date)),
    tensDayQuarter: (() => { const m = new Map<string, number>(); for (const g of quarter) if (g.value === 10) m.set(g.date, (m.get(g.date) ?? 0) + 1); return Math.max(0, ...m.values()); })(),
    comeback,
    subjMin: subjAvgs.length >= 3 ? Math.min(...subjAvgs) : 0,
    attendTotal: Number(att?.total ?? 0),
    absent: Number(att?.absent ?? 0),
    leader,
    grade: Number(cls?.grade ?? 0),
  };
}
export type Stats = ReturnType<typeof studentStats>;

type Tier = "bronze" | "silver" | "gold" | "legend";
type AchDef = { id: string; group: string; title: string; hint: string; tier: Tier; target: number; value: (s: Stats) => number; senior?: boolean };

/** Достижения. Простые — «Первый шаг», «Разгон», «Чистая работа»; остальные требуют серьёзных усилий */
export const ACHIEVEMENTS: AchDef[] = [
  { id: "quiz1", group: "Квизы", title: "Первый шаг", hint: "Пройти первый квиз дня", tier: "bronze", target: 1, value: (s) => s.daily },
  { id: "streak3", group: "Серия", title: "Разгон", hint: "3 дня подряд с квизом дня", tier: "bronze", target: 3, value: (s) => s.best },
  { id: "perfect1", group: "Квизы", title: "Чистая работа", hint: "Квиз дня без единой ошибки", tier: "bronze", target: 1, value: (s) => s.perfect },

  { id: "streak14", group: "Серия", title: "Две недели", hint: "14 дней подряд с квизом дня", tier: "silver", target: 14, value: (s) => s.best },
  { id: "streak30", group: "Серия", title: "Месяц без пропусков", hint: "30 дней подряд", tier: "gold", target: 30, value: (s) => s.best },
  { id: "streak60", group: "Серия", title: "Железная воля", hint: "60 дней подряд", tier: "legend", target: 60, value: (s) => s.best },
  { id: "streak100", group: "Серия", title: "Сотня", hint: "100 дней подряд", tier: "legend", target: 100, value: (s) => s.best },

  { id: "perfect5", group: "Квизы", title: "Безупречная пятёрка", hint: "5 квизов дня подряд без единой ошибки", tier: "gold", target: 5, value: (s) => s.perfectRun },
  { id: "quiz100", group: "Квизы", title: "Эрудит", hint: "Пройти 100 квизов дня", tier: "gold", target: 100, value: (s) => s.daily },

  { id: "hattrick", group: "Отметки", title: "Хет-трик", hint: "Получить три «10» за один день", tier: "legend", target: 3, value: (s) => s.tensDayMax },
  { id: "tensweek", group: "Отметки", title: "Неделя десяток", hint: "Пять «10» за одну неделю", tier: "gold", target: 5, value: (s) => s.tensWeekMax },
  { id: "tens25", group: "Отметки", title: "Коллекционер", hint: "Собрать 25 отметок «10»", tier: "gold", target: 25, value: (s) => s.tensEver },
  { id: "comeback", group: "Отметки", title: "Камбэк", hint: "После отметки 4 и ниже получить 9 или 10 по тому же предмету", tier: "silver", target: 1, value: (s) => s.comeback },
  { id: "nolow", group: "Отметки", title: "Без слабых мест", hint: "Ни одной отметки ниже 7 за четверть (от 15 отметок)", tier: "gold", target: 1,
    value: (s) => (s.count >= 15 && s.min >= 7 ? 1 : 0) },
  { id: "allround", group: "Отметки", title: "Мастер на все руки", hint: "Средний 8+ по каждому предмету четверти", tier: "gold", target: 1, value: (s) => (s.subjMin >= 8 ? 1 : 0) },
  { id: "prof", group: "Отметки", title: "Профессор", hint: "Средний балл за четверть 9 и выше (от 15 отметок)", tier: "legend", target: 1,
    value: (s) => (s.count >= 15 && s.avg >= 9 ? 1 : 0) },

  { id: "tasks100", group: "Задания", title: "Трудяга", hint: "Выполнить 100 заданий", tier: "gold", target: 100, value: (s) => s.tasks },
  { id: "checks20", group: "Задания", title: "Самоконтроль", hint: "Пройти 20 самопроверок ДЗ", tier: "silver", target: 20, value: (s) => s.checks },

  { id: "xp3000", group: "Опыт", title: "Звёздный ученик", hint: "Набрать 3000 XP", tier: "gold", target: 3000, value: (s) => s.xp },
  { id: "leader", group: "Опыт", title: "Лидер класса", hint: "Стать 1-м в рейтинге класса по опыту за неделю", tier: "silver", target: 1, value: (s) => s.leader },
  { id: "attend", group: "Посещаемость", title: "Всегда на месте", hint: "Ни одного пропуска без причины за четверть (от 40 уроков)", tier: "silver", target: 1,
    value: (s) => (s.attendTotal >= 40 && s.absent === 0 ? 1 : 0) },

  { id: "exam1", group: "ЦТ/ЦЭ", title: "Первый вариант", hint: "Сдать тренировочный вариант ЦТ/ЦЭ", tier: "silver", target: 1, value: (s) => s.exams, senior: true },
  { id: "exam90", group: "ЦТ/ЦЭ", title: "Почти сотня", hint: "Решить вариант ЦТ/ЦЭ на 90 % и выше", tier: "gold", target: 1, value: (s) => s.exam90, senior: true },
  { id: "exam8", group: "ЦТ/ЦЭ", title: "Готов к экзамену", hint: "Сдать 8 вариантов ЦТ/ЦЭ", tier: "legend", target: 8, value: (s) => s.exams, senior: true },
];

/** Рамки аватарки — за отметки текущей четверти (пересчитываются: можно и потерять) */
type FrameDef = { id: string; title: string; hint: string; short: string; target: number; value: (s: Stats) => number; show: (s: Stats) => string };
const avgShow = (s: Stats) => (s.count ? `сейчас ${String(s.avg).replace(".", ",")}` : "отметок пока нет");
const cnt = (v: number, n: number) => `${Math.min(v, n)} из ${n}`;
const both = (ok: boolean) => (ok ? 1 : 0);
export const FRAMES: FrameDef[] = [
  { id: "silver", title: "Серебро", short: "ср. 7+", hint: "Средний балл за четверть 7 и выше", target: 7, value: (s) => s.avg, show: avgShow },
  { id: "sapphire", title: "Сапфир", short: "ср. 7,5+", hint: "Средний балл за четверть 7,5 и выше", target: 7.5, value: (s) => s.avg, show: avgShow },
  { id: "ten", title: "Красная ручка", short: "одна «10»", hint: "Хотя бы одна «10» за четверть", target: 1, value: (s) => s.tens, show: (s) => cnt(s.tens, 1) },
  { id: "neon", title: "Неон", short: "10 отметок 8+", hint: "10 отметок 8–10 за четверть", target: 10, value: (s) => s.eights, show: (s) => cnt(s.eights, 10) },
  { id: "gold", title: "Золото", short: "ср. 8+", hint: "Средний балл за четверть 8 и выше", target: 8, value: (s) => s.avg, show: avgShow },
  { id: "aurora", title: "Северное сияние", short: "ср. 7,5+, без < 6", hint: "Средний 7,5+ и ни одной отметки ниже 6 (от 8 отметок)", target: 1,
    value: (s) => both(s.count >= 8 && s.min >= 6 && s.avg >= 7.5), show: (s) => (s.count < 8 ? `отметок ${s.count} из 8` : s.min < 6 ? `есть отметка ${s.min}` : avgShow(s)) },
  { id: "emerald", title: "Изумруд", short: "ср. 8+, без < 6", hint: "Средний 8+ и ни одной отметки ниже 6 (от 10 отметок)", target: 1,
    value: (s) => both(s.count >= 10 && s.min >= 6 && s.avg >= 8), show: (s) => (s.count < 10 ? `отметок ${s.count} из 10` : s.min < 6 ? `есть отметка ${s.min}` : avgShow(s)) },
  { id: "honors", title: "Отличник", short: "5 отметок 9+", hint: "Пять отметок 9–10 за четверть", target: 5, value: (s) => s.nines, show: (s) => cnt(s.nines, 5) },
  { id: "sakura", title: "Сакура", short: "8 отметок 9+", hint: "Восемь отметок 9–10 за четверть", target: 8, value: (s) => s.nines, show: (s) => cnt(s.nines, 8) },
  { id: "rainbow", title: "Радуга", short: "15 отметок 8+", hint: "15 отметок 8–10 за четверть", target: 15, value: (s) => s.eights, show: (s) => cnt(s.eights, 15) },
  { id: "laurel", title: "Лавры", short: "ср. 8,5+", hint: "Средний балл за четверть 8,5 и выше", target: 8.5, value: (s) => s.avg, show: avgShow },
  { id: "crown", title: "Корона", short: "три «10»", hint: "Три «10» за четверть", target: 3, value: (s) => s.tens, show: (s) => cnt(s.tens, 3) },
  { id: "ruby", title: "Рубин", short: "четыре «10»", hint: "Четыре «10» за четверть", target: 4, value: (s) => s.tens, show: (s) => cnt(s.tens, 4) },
  { id: "electro", title: "Электро", short: "10 отметок 9+", hint: "Десять отметок 9–10 за четверть", target: 10, value: (s) => s.nines, show: (s) => cnt(s.nines, 10) },
  { id: "pixel", title: "Пиксель", short: "пять «10»", hint: "Пять «10» за четверть", target: 5, value: (s) => s.tens, show: (s) => cnt(s.tens, 5) },
  { id: "star", title: "Звезда", short: "ср. 9+", hint: "Средний балл за четверть 9 и выше", target: 9, value: (s) => s.avg, show: avgShow },
  { id: "flame", title: "Пламя", short: "три «10» за день", hint: "Три «10» за один день в этой четверти", target: 3, value: (s) => s.tensDayQuarter, show: (s) => cnt(s.tensDayQuarter, 3) },
  { id: "holo", title: "Голограмма", short: "ср. 9+ и пять «10»", hint: "Средний 9+ и пять «10» за четверть", target: 1,
    value: (s) => both(s.avg >= 9 && s.tens >= 5), show: (s) => `${avgShow(s)}, «10»: ${cnt(s.tens, 5)}` },
  { id: "cosmos", title: "Космос", short: "ср. 9,5+", hint: "Средний балл за четверть 9,5 и выше", target: 9.5, value: (s) => s.avg, show: avgShow },
  { id: "diamond", title: "Бриллиант", short: "ср. 9,5+ (15 отметок)", hint: "Средний 9,5+ при 15 и более отметках за четверть", target: 1,
    value: (s) => both(s.count >= 15 && s.avg >= 9.5), show: (s) => `${avgShow(s)}, отметок ${s.count}` },
];

/** Фоны профиля — за выполненные задания (ДЗ, самопроверки, варианты ЦТ/ЦЭ); открытый фон остаётся навсегда */
export const BACKGROUNDS: { id: string; title: string; target: number }[] = [
  { id: "grid", title: "Тетрадь", target: 0 },
  { id: "dawn", title: "Рассвет", target: 1 },
  { id: "mint", title: "Мята", target: 3 },
  { id: "ocean", title: "Океан", target: 5 },
  { id: "lavender", title: "Лаванда", target: 8 },
  { id: "vyshyvanka", title: "Вышиванка", target: 12 },
  { id: "lined", title: "Конспект", target: 16 },
  { id: "formulas", title: "Формулы", target: 20 },
  { id: "forest", title: "Пуща", target: 25 },
  { id: "mosaic", title: "Мозаика", target: 30 },
  { id: "sunset", title: "Закат", target: 35 },
  { id: "synth", title: "Неон-город", target: 40 },
  { id: "topo", title: "Карта", target: 50 },
  { id: "space", title: "Космос", target: 60 },
  { id: "watercolor", title: "Акварель", target: 70 },
  { id: "aurora", title: "Северное сияние", target: 80 },
  { id: "galaxy", title: "Галактика", target: 100 },
  { id: "goldleaf", title: "Сусальное золото", target: 120 },
];

export function achievementsFor(s: Stats) {
  return ACHIEVEMENTS.filter((a) => !a.senior || s.grade >= 10).map((a) => {
    const value = a.value(s);
    return { id: a.id, group: a.group, title: a.title, hint: a.hint, tier: a.tier, target: a.target, value: Math.min(value, a.target), earned: value >= a.target };
  });
}
export function framesFor(s: Stats) {
  return FRAMES.map((f) => ({ id: f.id, title: f.title, hint: f.hint, short: f.short, progress: f.show(s), unlocked: s.count > 0 && f.value(s) >= f.target }));
}
export function backgroundsFor(s: Stats) {
  return BACKGROUNDS.map((b) => ({ ...b, value: Math.min(s.tasks, b.target), unlocked: s.tasks >= b.target }));
}

/** Что видят другие: фото, рамка (если ещё открыта), фон (если открыт), витрина (только заработанное) */
export function publicLook(userId: number) {
  const u = get("SELECT role, avatar, frame, showcase, background FROM users WHERE id = ?", userId);
  const empty = { avatar: null as string | null, frame: null as string | null, showcase: [] as string[], background: null as string | null };
  if (!u) return empty;
  if (u.role !== "student") return { ...empty, avatar: (u.avatar as string | null) ?? null };
  let showcase: string[] = [];
  try { showcase = JSON.parse(u.showcase ?? "[]"); } catch { showcase = []; }
  const needStats = showcase.length > 0 || u.frame || (u.background && u.background !== "grid");
  const s = needStats ? studentStats(userId) : null;
  if (s && showcase.length) {
    const earned = new Set(achievementsFor(s).filter((a) => a.earned).map((a) => a.id));
    showcase = showcase.filter((id) => earned.has(id)).slice(0, MAX_SHOWCASE);
  }
  const frame = u.frame && s && framesFor(s).some((f) => f.id === u.frame && f.unlocked) ? (u.frame as string) : null;
  const background = u.background && (u.background === "grid" || (s && backgroundsFor(s).some((b) => b.id === u.background && b.unlocked))) ? (u.background as string) : null;
  return { avatar: (u.avatar as string | null) ?? null, frame, showcase, background };
}
