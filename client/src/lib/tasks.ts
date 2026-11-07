export type TaskType = "choice" | "pairs" | "gaps" | "order" | "groups";

export type ChoiceData = { questions: { q: string; options: string[]; correct: number[] }[] };
export type PairsData = { pairs: { a: string; b: string }[] };
export type GapsData = { text: string };
export type OrderData = { items: string[] };
export type GroupsData = { groups: { name: string; items: string[] }[] };
export type TaskData = ChoiceData | PairsData | GapsData | OrderData | GroupsData;

export type Task = {
  id: number; type: TaskType; title: string; grade: number | null;
  subject: { id: number; name: string; color: string } | null;
  data: any; createdAt: string; updatedAt: string; size?: number; assigned?: number;
};

export type TaskAssignment = {
  id: number; taskId: number; title: string; type: TaskType;
  class: { id: number; name: string; grade: number };
  subject: { id: number; name: string; color: string } | null;
  dueOn: string | null; note: string | null; createdAt: string;
  students: number; done: number;
};

export type StudentTask = {
  id: number; title: string; type: TaskType; size: number;
  subject: { id: number; name: string; color: string } | null;
  dueOn: string | null; note: string | null;
  done: boolean; score: number | null; total: number | null; submittedAt: string | null;
};

export const TYPE_META: Record<TaskType, { title: string; short: string; text: string; unit: [string, string, string] }> = {
  choice: { title: "Тест с выбором ответа", short: "Тест", text: "Вопросы с вариантами — один или несколько верных", unit: ["вопрос", "вопроса", "вопросов"] },
  pairs: { title: "Найди пару", short: "Пары", text: "Соединить термин и определение, пример и ответ", unit: ["пара", "пары", "пар"] },
  gaps: { title: "Пропуски в тексте", short: "Пропуски", text: "Вписать пропущенные слова, числа, окончания", unit: ["пропуск", "пропуска", "пропусков"] },
  order: { title: "Расставь по порядку", short: "Порядок", text: "Шаги алгоритма, события на ленте времени", unit: ["шаг", "шага", "шагов"] },
  groups: { title: "Распредели по группам", short: "Группы", text: "Разложить понятия по 2–4 категориям", unit: ["элемент", "элемента", "элементов"] },
};

export const TYPE_ORDER: TaskType[] = ["choice", "pairs", "gaps", "order", "groups"];

export function emptyData(type: TaskType): TaskData {
  switch (type) {
    case "choice": return { questions: [{ q: "", options: ["", ""], correct: [0] }] };
    case "pairs": return { pairs: [{ a: "", b: "" }, { a: "", b: "" }, { a: "", b: "" }] };
    case "gaps": return { text: "" };
    case "order": return { items: ["", "", ""] };
    case "groups": return { groups: [{ name: "", items: [""] }, { name: "", items: [""] }] };
  }
}

/* ───────── Пропуски: «текст [ответ|вариант] текст» ───────── */
export type GapPart = { kind: "text"; text: string } | { kind: "gap"; answers: string[]; index: number };
export function parseGaps(text: string): GapPart[] {
  const parts: GapPart[] = [];
  let last = 0, index = 0;
  for (const m of text.matchAll(/\[([^\[\]]+)\]/g)) {
    if (m.index! > last) parts.push({ kind: "text", text: text.slice(last, m.index) });
    parts.push({ kind: "gap", answers: m[1].split("|").map((s) => s.trim()).filter(Boolean), index: index++ });
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}

export const normAnswer = (s: string) => s.trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").replace(/[.,;:!?]+$/, "");

/* ───────── Перемешивание (детерминированное по seed) ───────── */
export function shuffled<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let x = seed || 1;
  const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  // Не оставляем порядок совпадающим с исходным (иначе «Порядок» решён сразу)
  if (a.length > 2 && a.every((v, i) => v === arr[i])) a.push(a.shift()!);
  return a;
}

/** Чем заполнено задание — для подписи на карточке */
export function sizeOf(type: TaskType, data: any): number {
  switch (type) {
    case "choice": return data.questions?.length ?? 0;
    case "pairs": return data.pairs?.length ?? 0;
    case "gaps": return parseGaps(data.text ?? "").filter((p) => p.kind === "gap").length;
    case "order": return data.items?.length ?? 0;
    case "groups": return (data.groups ?? []).reduce((n: number, g: any) => n + (g.items?.length ?? 0), 0);
  }
}

/** Чистка перед сохранением: пустые строки убираем, индексы верных ответов пересчитываем */
export function cleanForSave(type: TaskType, data: any): TaskData {
  const t = (s: string) => s.trim();
  switch (type) {
    case "choice": return {
      questions: (data as ChoiceData).questions.map((q) => {
        const keep = q.options.map((o, i) => ({ o: t(o), i })).filter((x) => x.o);
        return { q: t(q.q), options: keep.map((x) => x.o), correct: keep.flatMap((x, ni) => (q.correct.includes(x.i) ? [ni] : [])) };
      }).filter((q) => q.q || q.options.length),
    };
    case "pairs": return { pairs: (data as PairsData).pairs.map((p) => ({ a: t(p.a), b: t(p.b) })).filter((p) => p.a || p.b) };
    case "gaps": return { text: (data as GapsData).text.trim() };
    case "order": return { items: (data as OrderData).items.map(t).filter(Boolean) };
    case "groups": return { groups: (data as GroupsData).groups.map((g) => ({ name: t(g.name), items: g.items.map(t).filter(Boolean) })).filter((g) => g.name || g.items.length) };
  }
}
