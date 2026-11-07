import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import { ArrowDown, ArrowUp, Check, CheckCircle2, GripVertical, Maximize2, Minimize2, RotateCcw, X } from "lucide-react";
import { TYPE_META, normAnswer, parseGaps, shuffled, type ChoiceData, type GapsData, type GroupsData, type OrderData, type PairsData, type TaskType } from "../lib/tasks";

type Result = { ok: number; total: number } | null;
type PlayerProps = {
  type: TaskType; title: string; data: any; subtitle?: string; compact?: boolean;
  /** Вызывается один раз после «Проверить» — для сдачи назначенного задания */
  onComplete?: (r: { ok: number; total: number }) => void;
};

/** Проигрыватель интерактивного задания: решить, проверить, начать заново, показать на весь экран. */
export function TaskPlayer({ type, title, data, subtitle, compact = false, onComplete }: PlayerProps) {
  const [seed, setSeed] = useState(() => 1 + Math.floor(Math.random() * 1e6));
  const [result, setResult] = useState<Result>(null);
  const [checkSignal, setCheckSignal] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const dataKey = useMemo(() => JSON.stringify(data), [data]);
  const reported = useRef(false);

  // Задание поменялось в редакторе — начинаем заново
  useEffect(() => { setResult(null); setCheckSignal(0); reported.current = false; }, [dataKey, type]);
  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === box.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  useEffect(() => {
    if (!result || !onComplete || reported.current) return;
    reported.current = true;
    onComplete(result);
  }, [result, onComplete]);

  const restart = () => { setSeed((s) => s + 7919); setResult(null); setCheckSignal(0); reported.current = false; };
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void box.current?.requestFullscreen?.();
  };
  const props = { data, seed, checked: checkSignal > 0, onResult: setResult };
  const k = `${seed}-${dataKey}`;

  return (
    <div className={`tp ${compact ? "tp-compact" : ""} ${full ? "tp-full" : ""}`} ref={box}>
      <header className="tp-head">
        <div style={{ minWidth: 0 }}>
          <span className="tp-kind">{TYPE_META[type].title}</span>
          <h3 className="tp-title">{title || "Без названия"}</h3>
          {subtitle && <span className="tp-sub">{subtitle}</span>}
        </div>
        <div className="tp-tools">
          {document.fullscreenEnabled && (
            <button type="button" className="btn btn-sm btn-ghost" onClick={toggleFull} aria-label={full ? "Выйти из полноэкранного режима" : "На весь экран"} title={full ? "Свернуть" : "На весь экран — для интерактивной доски"}>
              {full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          )}
        </div>
      </header>

      <div className="tp-body">
        {type === "choice" && <ChoicePlay key={k} {...props} />}
        {type === "pairs" && <PairsPlay key={k} {...props} />}
        {type === "gaps" && <GapsPlay key={k} {...props} />}
        {type === "order" && <OrderPlay key={k} {...props} />}
        {type === "groups" && <GroupsPlay key={k} {...props} />}
      </div>

      <footer className="tp-foot">
        {result ? (
          <div className={`tp-result ${result.ok === result.total ? "all" : ""}`} role="status">
            {result.ok === result.total ? <CheckCircle2 size={22} /> : <span className="tp-score">{result.ok}/{result.total}</span>}
            <span>{result.ok === result.total ? "Отлично! Всё верно." : `Верно ${result.ok} из ${result.total}. Ошибки подсвечены.`}</span>
          </div>
        ) : <span className="tp-hint">{HINT[type]}</span>}
        <div className="row" style={{ gap: 8, marginLeft: "auto" }}>
          {checkSignal > 0 && <button type="button" className="btn btn-sm" onClick={restart}><RotateCcw size={15} /> Ещё раз</button>}
          {checkSignal === 0 && <button type="button" className="btn btn-sm btn-primary" onClick={() => setCheckSignal(1)}><Check size={15} /> Проверить</button>}
        </div>
      </footer>
    </div>
  );
}

const HINT: Record<TaskType, string> = {
  choice: "Выберите ответ в каждом вопросе",
  pairs: "Нажмите на карточку слева, затем на её пару справа",
  gaps: "Впишите пропущенные слова",
  order: "Перетащите строки или двигайте стрелками",
  groups: "Нажмите на карточку, затем на группу — или перетащите",
};

type SubProps<D> = { data: D; seed: number; checked: boolean; onResult: (r: Result) => void };

/** Сообщить результат родителю, когда нажали «Проверить» */
function useReport(checked: boolean, compute: () => { ok: number; total: number }, onResult: (r: Result) => void) {
  const ref = useRef(compute);
  ref.current = compute;
  useEffect(() => { if (checked) onResult(ref.current()); }, [checked, onResult]);
}

/** Перевести фокус на элемент (по селектору внутри root) после ближайшей перерисовки — для управления с клавиатуры */
function useFocusLater(root: RefObject<HTMLElement>) {
  const pending = useRef<string | null>(null);
  useEffect(() => {
    if (!pending.current) return;
    root.current?.querySelector<HTMLElement>(pending.current)?.focus();
    pending.current = null;
  });
  return useCallback((selector: string) => { pending.current = selector; }, []);
}

/* ───────── Тест ───────── */
function ChoicePlay({ data, seed, checked, onResult }: SubProps<ChoiceData>) {
  const qs = data.questions;
  const orders = useMemo(() => qs.map((q, qi) => shuffled(q.options.map((_, i) => i), seed + qi * 31)), [qs, seed]);
  const [ans, setAns] = useState<number[][]>(() => qs.map(() => []));
  const isOk = (qi: number) => {
    const a = [...(ans[qi] ?? [])].sort(), c = [...qs[qi].correct].sort();
    return a.length === c.length && a.every((x, i) => x === c[i]);
  };
  useReport(checked, () => ({ ok: qs.filter((_, qi) => isOk(qi)).length, total: qs.length }), onResult);

  const pick = (qi: number, oi: number) => {
    if (checked) return;
    const multi = qs[qi].correct.length > 1;
    setAns((a) => a.map((x, i) => (i !== qi ? x : multi ? (x.includes(oi) ? x.filter((y) => y !== oi) : [...x, oi]) : [oi])));
  };

  return (
    <ol className="tp-qs">
      {qs.map((q, qi) => (
        <li key={qi} className={checked ? (isOk(qi) ? "ok" : "bad") : ""}>
          <p className="tp-q">{q.q || <span className="muted">Вопрос {qi + 1}</span>}</p>
          {q.correct.length > 1 && <span className="tp-multi">несколько верных ответов</span>}
          <div className="tp-opts" role={q.correct.length > 1 ? "group" : "radiogroup"} aria-label={q.q}>
            {orders[qi].map((oi) => {
              const on = ans[qi]?.includes(oi);
              const right = q.correct.includes(oi);
              const cls = checked ? (right ? (on ? "ok" : "missed") : on ? "bad" : "") : on ? "on" : "";
              return (
                <button key={oi} type="button" className={`tp-opt ${cls} ${q.correct.length > 1 ? "multi" : ""}`}
                  role={q.correct.length > 1 ? "checkbox" : "radio"} aria-checked={!!on} onClick={() => pick(qi, oi)} disabled={checked && !on && !right}>
                  <span className="tp-mark" aria-hidden>{checked && right ? <Check size={13} strokeWidth={3} /> : checked && on ? <X size={13} strokeWidth={3} /> : null}</span>
                  {q.options[oi] || <span className="muted">Вариант {oi + 1}</span>}
                </button>
              );
            })}
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ───────── Найди пару ───────── */
const PAIR_COLORS = ["#2140c4", "#0e7c86", "#b4232f", "#6a4bd8", "#b86e00", "#2f8f4e", "#c2410c", "#8a5a1f", "#0f6cbd", "#b91c4b", "#4b5563", "#7c3aed"];

function PairsPlay({ data, seed, checked, onResult }: SubProps<PairsData>) {
  const n = data.pairs.length;
  const left = useMemo(() => shuffled([...Array(n).keys()], seed), [n, seed]);
  const right = useMemo(() => shuffled([...Array(n).keys()], seed + 101), [n, seed]);
  const [links, setLinks] = useState<Record<number, number>>({}); // левая пара → правая пара
  const [sel, setSel] = useState<number | null>(null);
  useReport(checked, () => ({ ok: left.filter((i) => links[i] === i).length, total: n }), onResult);
  const colorOf = (l: number) => PAIR_COLORS[Object.keys(links).map(Number).sort((a, b) => left.indexOf(a) - left.indexOf(b)).indexOf(l) % PAIR_COLORS.length];
  const leftOf = (r: number) => Object.entries(links).find(([, v]) => v === r)?.[0];
  const root = useRef<HTMLDivElement>(null);
  const [say, setSay] = useState(""); // объявления для экранного диктора
  const focusLater = useFocusLater(root);
  const aText = (l: number) => data.pairs[l].a || `карточка ${left.indexOf(l) + 1}`;
  const bText = (r: number) => data.pairs[r].b || `карточка ${right.indexOf(r) + 1}`;

  const clickLeft = (l: number, byKeyboard: boolean) => {
    if (checked) return;
    if (sel === l) { setSel(null); setSay(`Выбор «${aText(l)}» снят`); return; }
    setSel(l);
    setSay(`Выбрано «${aText(l)}». Теперь выберите пару в правой колонке`);
    // с клавиатуры сразу переводим фокус в правую колонку — на первую свободную карточку
    if (byKeyboard) {
      const free = right.find((r) => leftOf(r) == null) ?? right[0];
      focusLater(`[data-pr="${free}"]`);
    }
  };

  const clickRight = (r: number, byKeyboard: boolean) => {
    if (checked) return;
    const owner = leftOf(r);
    if (sel == null) {
      if (owner != null) {
        setLinks((x) => { const y = { ...x }; delete y[Number(owner)]; return y; });
        setSay(`Пара «${aText(Number(owner))}» — «${bText(r)}» разъединена`);
      } else setSay("Сначала выберите карточку в левой колонке");
      return;
    }
    const nextLinks = { ...links };
    for (const k of Object.keys(nextLinks)) if (nextLinks[Number(k)] === r) delete nextLinks[Number(k)];
    nextLinks[sel] = r;
    setLinks(nextLinks);
    const left2 = left.filter((l) => nextLinks[l] == null).length;
    setSay(`Соединено: «${aText(sel)}» — «${bText(r)}». ${left2 ? `Осталось без пары: ${left2}` : "Все пары составлены — можно проверять"}`);
    setSel(null);
    if (byKeyboard) {
      const nextFree = left.find((l) => nextLinks[l] == null);
      focusLater(nextFree != null ? `[data-pl="${nextFree}"]` : `[data-pl="${sel}"]`);
    }
  };

  // Стрелки: ↑/↓ — по колонке, ←/→ — между колонками; Esc — снять выбор
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && sel != null) { e.preventDefault(); e.stopPropagation(); setSay(`Выбор «${aText(sel)}» снят`); focusLater(`[data-pl="${sel}"]`); setSel(null); return; }
    const t = e.target as HTMLElement;
    const isL = t.dataset.pl != null, isR = t.dataset.pr != null;
    if (!isL && !isR) return;
    const col = isL ? left : right;
    const idx = col.indexOf(Number(isL ? t.dataset.pl : t.dataset.pr));
    let sel2: string | null = null;
    if (e.key === "ArrowDown") sel2 = `[data-${isL ? "pl" : "pr"}="${col[Math.min(col.length - 1, idx + 1)]}"]`;
    else if (e.key === "ArrowUp") sel2 = `[data-${isL ? "pl" : "pr"}="${col[Math.max(0, idx - 1)]}"]`;
    else if (e.key === "ArrowRight" && isL) sel2 = `[data-pr="${right[Math.min(right.length - 1, idx)]}"]`;
    else if (e.key === "ArrowLeft" && isR) sel2 = `[data-pl="${left[Math.min(left.length - 1, idx)]}"]`;
    if (sel2) { e.preventDefault(); root.current?.querySelector<HTMLElement>(sel2)?.focus(); }
  };

  const status = (ok: boolean) => (ok ? ", верно" : ", неверно");

  return (
    <div className="tp-pairs" ref={root} onKeyDown={onKeyDown}>
      <div className="tp-col" role="group" aria-label="Левая колонка: выберите карточку">
        {left.map((l) => {
          const linked = links[l] != null;
          const st = checked ? (links[l] === l ? "ok" : "bad") : "";
          const label = `${aText(l)}${linked ? `, в паре с «${bText(links[l])}»` : ", без пары"}${checked ? status(links[l] === l) : ""}`;
          return (
            <button key={l} type="button" data-pl={l} className={`tp-card ${sel === l ? "sel" : ""} ${linked ? "linked" : ""} ${st}`}
              style={linked ? ({ "--pc": colorOf(l) } as CSSProperties) : undefined} aria-pressed={sel === l} aria-label={label}
              onClick={(e) => clickLeft(l, e.detail === 0)}>
              {data.pairs[l].a || <span className="muted">…</span>}
              {linked && <span className="tp-dot" aria-hidden />}
            </button>
          );
        })}
      </div>
      <div className="tp-col" role="group" aria-label="Правая колонка: выберите пару">
        {right.map((r) => {
          const owner = leftOf(r);
          const st = checked && owner != null ? (Number(owner) === r ? "ok" : "bad") : "";
          const label = `${bText(r)}${owner != null ? `, в паре с «${aText(Number(owner))}»` : ", без пары"}${checked && owner != null ? status(Number(owner) === r) : ""}`
            + (!checked && sel != null ? ` — соединить с «${aText(sel)}»` : !checked && owner != null ? " — нажмите, чтобы разъединить" : "");
          return (
            <button key={r} type="button" data-pr={r} className={`tp-card right ${owner != null ? "linked" : ""} ${sel != null && owner == null ? "target" : ""} ${st}`}
              style={owner != null ? ({ "--pc": colorOf(Number(owner)) } as CSSProperties) : undefined} aria-label={label}
              onClick={(e) => clickRight(r, e.detail === 0)}>
              {owner != null && <span className="tp-dot" aria-hidden />}
              {data.pairs[r].b || <span className="muted">…</span>}
            </button>
          );
        })}
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">{say}</p>
      {checked && left.some((l) => links[l] !== l) && (
        <div className="tp-answers">
          <b>Правильные пары:</b> {data.pairs.map((p, i) => <span key={i} className="tp-ans">{p.a} — {p.b}</span>)}
        </div>
      )}
    </div>
  );
}

/* ───────── Пропуски ───────── */
function GapsPlay({ data, checked, onResult }: SubProps<GapsData>) {
  const parts = useMemo(() => parseGaps(data.text), [data.text]);
  const gaps = parts.filter((p) => p.kind === "gap") as Extract<(typeof parts)[number], { kind: "gap" }>[];
  const [vals, setVals] = useState<string[]>(() => gaps.map(() => ""));
  const ok = (i: number) => gaps[i].answers.some((a) => normAnswer(a) === normAnswer(vals[i] ?? ""));
  useReport(checked, () => ({ ok: gaps.filter((_, i) => ok(i)).length, total: gaps.length }), onResult);
  if (!data.text.trim()) return <p className="muted">Текст задания появится здесь.</p>;
  return (
    <p className="tp-gaps">
      {parts.map((p, k) => p.kind === "text" ? <span key={k}>{p.text}</span> : (
        <span key={k} className={`tp-gap ${checked ? (ok(p.index) ? "ok" : "bad") : ""}`}>
          <input value={vals[p.index] ?? ""} readOnly={checked} aria-label={`Пропуск ${p.index + 1}`}
            style={{ width: `${Math.max(4, Math.max(...p.answers.map((a) => a.length)) + 2)}ch` }}
            onChange={(e) => setVals((v) => v.map((x, i) => (i === p.index ? e.target.value : x)))} />
          {checked && !ok(p.index) && <span className="tp-fix">{p.answers[0]}</span>}
        </span>
      ))}
    </p>
  );
}

/* ───────── Порядок ───────── */
function OrderPlay({ data, seed, checked, onResult }: SubProps<OrderData>) {
  const n = data.items.length;
  const [order, setOrder] = useState<number[]>(() => shuffled([...Array(n).keys()], seed));
  const [drag, setDrag] = useState<number | null>(null);
  useReport(checked, () => ({ ok: order.filter((v, i) => v === i).length, total: n }), onResult);
  const move = (from: number, to: number) => {
    if (checked || to < 0 || to >= n || from === to) return;
    setOrder((o) => { const a = [...o]; const [x] = a.splice(from, 1); a.splice(to, 0, x); return a; });
  };
  return (
    <ol className="tp-order">
      {order.map((v, i) => (
        <li key={v} className={`${checked ? (v === i ? "ok" : "bad") : ""} ${drag === i ? "dragging" : ""}`}
          draggable={!checked}
          onDragStart={(e: DragEvent) => { setDrag(i); e.dataTransfer.effectAllowed = "move"; }}
          onDragOver={(e) => { e.preventDefault(); if (drag != null && drag !== i) { move(drag, i); setDrag(i); } }}
          onDragEnd={() => setDrag(null)}>
          <span className="tp-n">{i + 1}</span>
          {!checked && <GripVertical size={16} className="tp-grip" aria-hidden />}
          <span className="grow">{data.items[v] || <span className="muted">…</span>}</span>
          {checked && v !== i && <span className="tp-should">должно быть {v + 1}-м</span>}
          {!checked && (
            <span className="tp-arrows">
              <button type="button" className="btn btn-ghost btn-icon btn-sm" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label="Выше"><ArrowUp size={15} /></button>
              <button type="button" className="btn btn-ghost btn-icon btn-sm" disabled={i === n - 1} onClick={() => move(i, i + 1)} aria-label="Ниже"><ArrowDown size={15} /></button>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

/* ───────── Группы ───────── */
function GroupsPlay({ data, seed, checked, onResult }: SubProps<GroupsData>) {
  const items = useMemo(() => shuffled(data.groups.flatMap((g, gi) => g.items.map((text, ii) => ({ id: `${gi}-${ii}`, text, group: gi }))), seed), [data, seed]);
  const [place, setPlace] = useState<Record<string, number>>({});
  const [sel, setSel] = useState<string | null>(null);
  useReport(checked, () => ({ ok: items.filter((x) => place[x.id] === x.group).length, total: items.length }), onResult);
  const root = useRef<HTMLDivElement>(null);
  const [say, setSay] = useState(""); // объявления для экранного диктора
  const focusLater = useFocusLater(root);
  const gName = (gi: number) => data.groups[gi]?.name || `Группа ${gi + 1}`;
  const xText = (id: string) => items.find((x) => x.id === id)?.text || "карточка";

  const put = (id: string, g: number | null, byKeyboard = false) => {
    if (checked || !id) return;
    const apply = (p: Record<string, number>) => { const q = { ...p }; if (g == null) delete q[id]; else q[id] = g; return q; };
    setPlace(apply); // функциональное обновление — несколько put подряд в одном событии не затирают друг друга
    setSel(null);
    const nextPlace = apply(place);
    const rest = items.filter((x) => nextPlace[x.id] == null);
    setSay(g == null
      ? `«${xText(id)}» возвращена к нераспределённым карточкам`
      : `«${xText(id)}» — в группе «${gName(g)}». ${rest.length ? `Осталось разложить: ${rest.length}` : "Все карточки разложены — можно проверять"}`);
    // с клавиатуры — фокус на следующую нераспределённую карточку (или на эту же, если всё разложено)
    if (byKeyboard) focusLater(rest.length ? `[data-chip="${rest[0].id}"]` : `[data-chip="${id}"]`);
  };
  const pick = (id: string, byKeyboard: boolean) => {
    if (checked) return;
    if (sel === id) { setSel(null); setSay(`Выбор «${xText(id)}» снят`); return; }
    setSel(id);
    setSay(`Выбрана «${xText(id)}». Теперь выберите группу`);
    if (byKeyboard) focusLater(`[data-zone="0"]`);
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape" && sel != null) {
      e.preventDefault(); e.stopPropagation();
      setSay(`Выбор «${xText(sel)}» снят`); focusLater(`[data-chip="${sel}"]`); setSel(null);
    }
  };

  const chip = (x: (typeof items)[number]) => {
    const placed = place[x.id] != null;
    const label = `${x.text || "…"}${placed ? `, в группе «${gName(place[x.id])}»` : ""}${checked ? (place[x.id] === x.group ? ", верно" : ", неверно") : placed ? " — нажмите, чтобы вернуть" : ""}`;
    return (
      <button key={x.id} type="button" draggable={!checked} data-chip={x.id}
        className={`tp-chip ${sel === x.id ? "sel" : ""} ${checked ? (place[x.id] === x.group ? "ok" : "bad") : ""}`}
        aria-pressed={placed ? undefined : sel === x.id} aria-label={label}
        onDragStart={(e) => { e.dataTransfer.setData("text/plain", x.id); setSel(x.id); }}
        onClick={(e) => { if (checked) return; if (placed) put(x.id, null, e.detail === 0); else pick(x.id, e.detail === 0); }}>
        {x.text || "…"}
      </button>
    );
  };
  const pool = items.filter((x) => place[x.id] == null);
  return (
    <div className="tp-groups" ref={root} onKeyDown={onKeyDown}>
      <div className={`tp-pool ${pool.length === 0 ? "empty" : ""}`} role="group" aria-label="Нераспределённые карточки"
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => put(e.dataTransfer.getData("text/plain"), null)}>
        {pool.length ? pool.map(chip) : <span className="muted small">{checked ? "Все карточки разложены" : "Все карточки разложены — можно проверять"}</span>}
      </div>
      <div className="tp-zones" style={{ "--n": data.groups.length } as CSSProperties}>
        {data.groups.map((g, gi) => (
          <div key={gi} className={`tp-zone ${sel != null ? "target" : ""}`} role="group" aria-label={`Группа «${gName(gi)}»`}
            onClick={() => sel != null && put(sel, gi)}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); put(e.dataTransfer.getData("text/plain"), gi); }}>
            <b className="tp-zone-h">{g.name || `Группа ${gi + 1}`}</b>
            {/* Кнопка-цель для клавиатуры: появляется, когда карточка выбрана. Мышью по-прежнему можно кликнуть в любое место группы */}
            {!checked && sel != null && (
              <button type="button" className="tp-zone-put" data-zone={gi}
                aria-label={`Положить «${xText(sel)}» в группу «${gName(gi)}»`}
                onClick={(e) => { e.stopPropagation(); put(sel, gi, e.detail === 0); }}>
                Положить в «{gName(gi)}»
              </button>
            )}
            <div className="tp-zone-items">{items.filter((x) => place[x.id] === gi).map(chip)}</div>
          </div>
        ))}
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">{say}</p>
      {checked && items.some((x) => place[x.id] !== x.group) && (
        <div className="tp-answers"><b>Как верно:</b> {data.groups.map((g, gi) => <span key={gi} className="tp-ans">{g.name}: {g.items.join(", ")}</span>)}</div>
      )}
    </div>
  );
}
