import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowLeft, ArrowUp, Brackets, Check, Plus, Save, SearchX, Trash2, X } from "lucide-react";
import { useApi, useTitle } from "../../lib/hooks";
import { api, ApiError } from "../../lib/api";
import { useToast } from "../../lib/toast";
import { Empty, ErrorBox, Load, PageSkeleton } from "../../components/ui";
import { TaskPlayer } from "../../components/TaskPlayer";
import {
  TYPE_META, cleanForSave, emptyData, parseGaps, sizeOf,
  type ChoiceData, type GapsData, type GroupsData, type OrderData, type PairsData, type Task, type TaskType,
} from "../../lib/tasks";
import { plural } from "../../lib/materials";
import { TYPE_ICON, type TasksResp } from "./Tasks";

type Draft = { type: TaskType; title: string; subjectId: number | null; grade: number | null; data: any };

/** Создание (/t/tasks/new/:type) и редактирование (/t/tasks/:id) задания */
export default function TaskEditor() {
  const { id, type } = useParams();
  const [qs] = useSearchParams();
  const isNew = !id;
  const meta = useApi<TasksResp>("/teacher/tasks");
  const existing = useApi<Task>(isNew ? null : `/teacher/tasks/${id}`);
  useTitle(isNew ? "Новое задание" : "Изменить задание");

  if (!isNew) {
    if (existing.error) return <ErrorBox message={existing.error} onRetry={existing.reload} />;
    if (!existing.data || !meta.data) return <PageSkeleton />;
    const t = existing.data;
    return <Editor key={t.id} meta={meta.data} taskId={t.id}
      initial={{ type: t.type, title: t.title, subjectId: t.subject?.id ?? null, grade: t.grade, data: t.data }} />;
  }
  // Неизвестный :type в адресе — не подменяем молча на «тест», а говорим об этом прямо
  if (!type || !Object.prototype.hasOwnProperty.call(TYPE_META, type)) {
    return (
      <div className="panel" style={{ marginTop: 16 }} role="alert">
        <Empty icon={<SearchX size={28} />} title="Неизвестный тип задания">
          {type ? <>Тип «{type}» не поддерживается. </> : null}Выберите тип задания в конструкторе: тест, пары, пропуски, порядок или группы.
          <div style={{ marginTop: 12 }}>
            <Link to="/t/tasks" className="btn btn-sm btn-primary"><ArrowLeft size={16} /> К списку заданий</Link>
          </div>
        </Empty>
      </div>
    );
  }
  const tt = type as TaskType;
  return (
    <Load state={meta}>
      {(m) => {
        // заготовка из «Нужно сделать» / аналитики: тема, предмет и класс уже подставлены
        const subj = m.subjects.find((s) => s.name === qs.get("subject"));
        const g = Number(qs.get("grade")) || null;
        return <Editor key={tt} meta={m} taskId={null}
          initial={{ type: tt, title: qs.get("title") ?? "", subjectId: subj?.id ?? m.mine.subjectIds[0] ?? null, grade: g ?? m.mine.grades[0] ?? null, data: emptyData(tt) }} />;
      }}
    </Load>
  );
}

function Editor({ meta, initial, taskId }: { meta: TasksResp; initial: Draft; taskId: number | null }) {
  const nav = useNavigate();
  const toast = useToast();
  const [d, setD] = useState<Draft>(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const errRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (err) errRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [err]);
  const dirty = JSON.stringify(d) !== saved;
  const clean = useMemo(() => cleanForSave(d.type, d.data), [d.type, d.data]);
  const size = sizeOf(d.type, clean);
  const setData = useCallback((fn: (x: any) => any) => { setErr(null); setD((s) => ({ ...s, data: fn(s.data) })); }, []);

  const save = useCallback(async () => {
    if (busy) return;
    if (!d.title.trim()) { setErr("Введите название задания"); return; }
    setBusy(true); setErr(null);
    try {
      const body = { type: d.type, title: d.title.trim(), subjectId: d.subjectId, grade: d.grade, data: clean };
      const t = await api<Task>(taskId ? `/teacher/tasks/${taskId}` : "/teacher/tasks", { method: taskId ? "PUT" : "POST", body });
      setSaved(JSON.stringify(d));
      toast(taskId ? "Изменения сохранены" : "Задание создано");
      if (!taskId) nav(`/t/tasks/${t.id}`, { replace: true });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Не получилось сохранить");
    } finally { setBusy(false); }
  }, [busy, d, clean, taskId, nav, toast]);

  // Ctrl+S — сохранить; предупреждение при уходе с несохранёнными изменениями
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.code === "KeyS" || e.key.toLowerCase() === "s")) { e.preventDefault(); void save(); }
    };
    const onLeave = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    document.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => { document.removeEventListener("keydown", onKey); window.removeEventListener("beforeunload", onLeave); };
  }, [save, dirty]);

  const mineSubjects = meta.subjects.filter((s) => meta.mine.subjectIds.includes(s.id));
  const subject = meta.subjects.find((s) => s.id === d.subjectId);

  return (
    <div className="te">
      <div className="te-top">
        <Link to="/t/tasks" className="btn btn-ghost btn-sm"><ArrowLeft size={16} /> Все задания</Link>
        <span className={`te-type tk-${d.type}`}><span className={`tk-ico tk-${d.type}`} aria-hidden>{TYPE_ICON[d.type]}</span>{TYPE_META[d.type].title}</span>
        <span className={`te-status ${err ? "is-err" : ""}`} role="status">{busy ? "Сохраняю…" : err ? "Не сохранено — исправьте ошибку" : dirty ? "Есть несохранённые изменения" : taskId ? "Все изменения сохранены" : ""}</span>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => void save()} disabled={busy} title="Ctrl+S">
          <Save size={15} /> {taskId ? "Сохранить" : "Создать задание"}
        </button>
      </div>

      <div className="te-grid">
        <div className="te-form">
          <section className="te-card">
            <input className="te-title" value={d.title} maxLength={120} placeholder="Название задания" aria-label="Название задания" autoFocus={!taskId}
              onChange={(e) => setD({ ...d, title: e.target.value })} />
            <div className="te-row">
              <label className="te-field">
                <span>Предмет</span>
                <select className="select" value={d.subjectId ?? ""} onChange={(e) => setD({ ...d, subjectId: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">Без предмета</option>
                  {mineSubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="te-field">
                <span>Класс</span>
                <select className="select" value={d.grade ?? ""} onChange={(e) => setD({ ...d, grade: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">Любой</option>
                  {Array.from({ length: 11 }, (_, i) => i + 1).map((g) => <option key={g} value={g}>{g} класс</option>)}
                </select>
              </label>
            </div>
          </section>

          {d.type === "choice" && <ChoiceEditor data={d.data} set={setData} />}
          {d.type === "pairs" && <PairsEditor data={d.data} set={setData} />}
          {d.type === "gaps" && <GapsEditor data={d.data} set={setData} />}
          {d.type === "order" && <OrderEditor data={d.data} set={setData} />}
          {d.type === "groups" && <GroupsEditor data={d.data} set={setData} />}

          {err && <div ref={errRef} className="callout warn te-err" role="alert"><X size={16} /> {err}</div>}
        </div>

        <aside className="te-preview" aria-label="Предпросмотр">
          <div className="te-preview-h">
            <b>Так увидит ученик</b>
            <span>{size} {plural(size, ...TYPE_META[d.type].unit)}</span>
          </div>
          <TaskPlayer type={d.type} title={d.title} data={clean} compact
            subtitle={[subject?.name, d.grade ? `${d.grade} класс` : null].filter(Boolean).join(" · ") || undefined} />
        </aside>
      </div>
    </div>
  );
}

/* ───────── Общие мелочи редакторов ───────── */
type EdProps<D> = { data: D; set: (fn: (x: D) => D) => void };

/** Enter в поле — добавить следующую строку и перевести в неё фокус */
function useFocusNext() {
  const refs = useRef(new Map<string, HTMLInputElement | HTMLTextAreaElement | null>());
  const pending = useRef<string | null>(null);
  useEffect(() => {
    if (pending.current) { refs.current.get(pending.current)?.focus(); pending.current = null; }
  });
  return {
    reg: (key: string) => (el: HTMLInputElement | HTMLTextAreaElement | null) => { refs.current.set(key, el); },
    focusLater: (key: string) => { pending.current = key; },
    focus: (key: string) => refs.current.get(key)?.focus(),
  };
}

const onEnter = (fn: () => void) => (e: KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); fn(); } };
const upd = <T,>(arr: T[], i: number, v: T) => arr.map((x, k) => (k === i ? v : x));
const del = <T,>(arr: T[], i: number) => arr.filter((_, k) => k !== i);
const ins = <T,>(arr: T[], i: number, v: T) => [...arr.slice(0, i), v, ...arr.slice(i)];
const swap = <T,>(arr: T[], i: number, j: number) => { const a = [...arr]; [a[i], a[j]] = [a[j], a[i]]; return a; };

function Section({ title, hint, children, action }: { title: string; hint?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="te-card">
      <header className="te-card-h"><h2>{title}</h2>{action}</header>
      {hint && <p className="te-hint">{hint}</p>}
      {children}
    </section>
  );
}

/* ───────── Тест ───────── */
function ChoiceEditor({ data, set }: EdProps<ChoiceData>) {
  const f = useFocusNext();
  const [activeQuestion, setActiveQuestion] = useState(0);
  const qi = Math.min(activeQuestion, Math.max(0, data.questions.length - 1));
  const addQ = () => {
    if (data.questions.length >= 30) return;
    set((d) => ({ questions: [...d.questions, { q: "", options: ["", ""], correct: [0] }] }));
    setActiveQuestion(data.questions.length);
    f.focusLater(`q${data.questions.length}`);
  };
  const removeQ = () => {
    set((d) => ({ questions: del(d.questions, qi) }));
    const next = Math.min(qi, data.questions.length - 2);
    setActiveQuestion(next);
    f.focusLater(`q${next}`);
  };
  return (
    <>
      <nav className="te-question-nav" aria-label="Переключение вопросов">
        <button type="button" className="btn btn-sm" disabled={qi === 0} onClick={() => setActiveQuestion(qi - 1)}>← Предыдущий</button>
        <span className="te-question-count" role="status">Вопрос {qi + 1} из {data.questions.length}</span>
        <button type="button" className="btn btn-sm" disabled={qi >= data.questions.length - 1} onClick={() => setActiveQuestion(qi + 1)}>Следующий →</button>
      </nav>
      {data.questions.slice(qi, qi + 1).map((q) => {
        const setQ = (v: typeof q) => set((d) => ({ questions: upd(d.questions, qi, v) }));
        const addOpt = (at: number) => { setQ({ ...q, options: ins(q.options, at, ""), correct: q.correct.map((c) => (c >= at ? c + 1 : c)) }); f.focusLater(`o${qi}-${at}`); };
        return (
          <Section key={qi} title={`Вопрос ${qi + 1}`}
            action={data.questions.length > 1 && <button type="button" className="btn btn-ghost btn-sm te-del" onClick={removeQ}><Trash2 size={14} /> Удалить</button>}>
            <textarea ref={f.reg(`q${qi}`)} className="textarea te-q" rows={2} maxLength={300} placeholder="Текст вопроса" aria-label={`Текст вопроса ${qi + 1}`} value={q.q}
              onChange={(e) => setQ({ ...q, q: e.target.value })} />
            <p className="te-hint">Нажмите на кружок слева, чтобы отметить верный ответ. Можно отметить несколько.</p>
            <ul className="te-opts">
              {q.options.map((o, oi) => {
                const ok = q.correct.includes(oi);
                return (
                  <li key={oi} className={ok ? "ok" : ""}>
                    <button type="button" className="te-ok" aria-pressed={ok} aria-label={ok ? "Верный ответ — снять отметку" : "Отметить как верный"}
                      onClick={() => setQ({ ...q, correct: ok ? q.correct.filter((c) => c !== oi) : [...q.correct, oi].sort() })}>
                      {ok && <Check size={14} strokeWidth={3} />}
                    </button>
                    <input ref={f.reg(`o${qi}-${oi}`)} className="input" maxLength={150} placeholder={`Вариант ${oi + 1}`} value={o}
                      onChange={(e) => setQ({ ...q, options: upd(q.options, oi, e.target.value) })}
                      onKeyDown={onEnter(() => q.options.length < 6 && addOpt(oi + 1))} />
                    {q.options.length > 2 && (
                      <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Удалить вариант"
                        onClick={() => setQ({ ...q, options: del(q.options, oi), correct: q.correct.filter((c) => c !== oi).map((c) => (c > oi ? c - 1 : c)) })}><X size={15} /></button>
                    )}
                  </li>
                );
              })}
            </ul>
            {q.options.length < 6 && <button type="button" className="btn btn-sm te-add" onClick={() => addOpt(q.options.length)}><Plus size={14} /> Вариант</button>}
          </Section>
        );
      })}
      {data.questions.length < 30 && <button type="button" className="btn te-add-big" onClick={addQ}><Plus size={16} /> Добавить вопрос</button>}
    </>
  );
}

/* ───────── Пары ───────── */
function PairsEditor({ data, set }: EdProps<PairsData>) {
  const f = useFocusNext();
  const add = (at: number) => { if (data.pairs.length >= 12) return; set((d) => ({ pairs: ins(d.pairs, at, { a: "", b: "" }) })); f.focusLater(`a${at}`); };
  return (
    <Section title="Пары" hint="Слева — термин, вопрос или пример, справа — его пара. Ученик увидит правую колонку перемешанной. Enter — новая пара.">
      <ul className="te-pairs">
        {data.pairs.map((p, i) => (
          <li key={i}>
            <span className="te-n">{i + 1}</span>
            <input ref={f.reg(`a${i}`)} className="input" maxLength={120} placeholder="Например: 2a · 3a" value={p.a}
              onChange={(e) => set((d) => ({ pairs: upd(d.pairs, i, { ...p, a: e.target.value }) }))} onKeyDown={onEnter(() => f.focus(`b${i}`))} />
            <span className="te-link" aria-hidden>↔</span>
            <input ref={f.reg(`b${i}`)} className="input" maxLength={120} placeholder="Например: 6a²" value={p.b}
              onChange={(e) => set((d) => ({ pairs: upd(d.pairs, i, { ...p, b: e.target.value }) }))} onKeyDown={onEnter(() => add(i + 1))} />
            <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Удалить пару" disabled={data.pairs.length <= 2}
              onClick={() => set((d) => ({ pairs: del(d.pairs, i) }))}><X size={15} /></button>
          </li>
        ))}
      </ul>
      {data.pairs.length < 12 && <button type="button" className="btn btn-sm te-add" onClick={() => add(data.pairs.length)}><Plus size={14} /> Пара</button>}
    </Section>
  );
}

/* ───────── Пропуски ───────── */
function GapsEditor({ data, set }: EdProps<GapsData>) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const gaps = parseGaps(data.text).filter((p) => p.kind === "gap") as { kind: "gap"; answers: string[]; index: number }[];
  const makeGap = () => {
    const el = ta.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b, value } = el;
    if (a === b) { el.focus(); return; }
    const word = value.slice(a, b).trim();
    const next = `${value.slice(0, a)}[${word}]${value.slice(b)}`;
    set(() => ({ text: next }));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + word.length + 2, a + word.length + 2); });
  };
  return (
    <Section title="Текст с пропусками"
      hint={<>Выделите слово мышью и нажмите «Сделать пропуском» — или возьмите его в [квадратные скобки]. Несколько верных ответов — через черту: <code>[5|пять]</code>.</>}
      action={<button type="button" className="btn btn-sm" onMouseDown={(e) => e.preventDefault()} onClick={makeGap}><Brackets size={14} /> Сделать пропуском</button>}>
      <textarea ref={ta} className="textarea te-text" rows={8} maxLength={3000} value={data.text}
        placeholder="Например: Столица Беларуси — [Минск]. В году [12|двенадцать] месяцев."
        onChange={(e) => set(() => ({ text: e.target.value }))} />
      <div className="te-gaps">
        {gaps.length === 0 ? <span className="te-hint" style={{ margin: 0 }}>Пропусков пока нет</span>
          : gaps.map((g) => <span key={g.index} className="te-gap"><b>{g.index + 1}</b>{g.answers.join(" / ")}</span>)}
      </div>
    </Section>
  );
}

/* ───────── Порядок ───────── */
function OrderEditor({ data, set }: EdProps<OrderData>) {
  const f = useFocusNext();
  const add = (at: number) => { if (data.items.length >= 12) return; set((d) => ({ items: ins(d.items, at, "") })); f.focusLater(`i${at}`); };
  return (
    <Section title="Элементы в правильном порядке" hint="Впишите шаги или события по порядку — ученик получит их перемешанными. Enter — следующий шаг.">
      <ol className="te-order">
        {data.items.map((it, i) => (
          <li key={i}>
            <span className="te-n">{i + 1}</span>
            <input ref={f.reg(`i${i}`)} className="input" maxLength={150} placeholder={i === 0 ? "Первый шаг" : `Шаг ${i + 1}`} value={it}
              onChange={(e) => set((d) => ({ items: upd(d.items, i, e.target.value) }))} onKeyDown={onEnter(() => add(i + 1))} />
            <span className="te-arrows">
              <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Выше" disabled={i === 0} onClick={() => set((d) => ({ items: swap(d.items, i, i - 1) }))}><ArrowUp size={15} /></button>
              <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Ниже" disabled={i === data.items.length - 1} onClick={() => set((d) => ({ items: swap(d.items, i, i + 1) }))}><ArrowDown size={15} /></button>
              <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Удалить" disabled={data.items.length <= 3} onClick={() => set((d) => ({ items: del(d.items, i) }))}><X size={15} /></button>
            </span>
          </li>
        ))}
      </ol>
      {data.items.length < 12 && <button type="button" className="btn btn-sm te-add" onClick={() => add(data.items.length)}><Plus size={14} /> Шаг</button>}
    </Section>
  );
}

/* ───────── Группы ───────── */
function GroupsEditor({ data, set }: EdProps<GroupsData>) {
  const f = useFocusNext();
  const setG = (gi: number, g: GroupsData["groups"][number]) => set((d) => ({ groups: upd(d.groups, gi, g) }));
  return (
    <Section title="Группы и их элементы" hint="Ученик увидит все элементы вперемешку и разложит их по группам. Enter — следующий элемент."
      action={data.groups.length < 4 && <button type="button" className="btn btn-sm" onClick={() => { set((d) => ({ groups: [...d.groups, { name: "", items: [""] }] })); f.focusLater(`g${data.groups.length}`); }}><Plus size={14} /> Группа</button>}>
      <div className="te-groups" style={{ "--n": data.groups.length } as CSSProperties}>
        {data.groups.map((g, gi) => (
          <div key={gi} className="te-group">
            <div className="row" style={{ gap: 6 }}>
              <input ref={f.reg(`g${gi}`)} className="input te-gname" maxLength={60} placeholder={`Группа ${gi + 1}`} value={g.name}
                onChange={(e) => setG(gi, { ...g, name: e.target.value })} onKeyDown={onEnter(() => f.focus(`g${gi}-0`))} />
              {data.groups.length > 2 && <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Удалить группу" onClick={() => set((d) => ({ groups: del(d.groups, gi) }))}><Trash2 size={14} /></button>}
            </div>
            <ul>
              {g.items.map((it, ii) => (
                <li key={ii}>
                  <input ref={f.reg(`g${gi}-${ii}`)} className="input" maxLength={80} placeholder="Элемент" value={it}
                    onChange={(e) => setG(gi, { ...g, items: upd(g.items, ii, e.target.value) })}
                    onKeyDown={onEnter(() => { if (g.items.length < 12) { setG(gi, { ...g, items: ins(g.items, ii + 1, "") }); f.focusLater(`g${gi}-${ii + 1}`); } })} />
                  {g.items.length > 1 && <button type="button" className="btn btn-ghost btn-icon btn-sm" aria-label="Удалить элемент" onClick={() => setG(gi, { ...g, items: del(g.items, ii) })}><X size={14} /></button>}
                </li>
              ))}
            </ul>
            {g.items.length < 12 && <button type="button" className="btn btn-sm btn-ghost te-add" onClick={() => { setG(gi, { ...g, items: [...g.items, ""] }); f.focusLater(`g${gi}-${g.items.length}`); }}><Plus size={14} /> Элемент</button>}
          </div>
        ))}
      </div>
    </Section>
  );
}
