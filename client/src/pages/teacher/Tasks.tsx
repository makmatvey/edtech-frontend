import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowDownUp, Copy, Layers, ListChecks, Pencil, Play, Plus, Send, Shuffle, TextCursorInput, Trash2, Users } from "lucide-react";
import { useApi, useTitle } from "../../lib/hooks";
import { api, ApiError } from "../../lib/api";
import { useToast } from "../../lib/toast";
import { Empty, Load, Modal, PageHead } from "../../components/ui";
import { NbHead, NbPage } from "../../components/paper";
import { TaskPlayer } from "../../components/TaskPlayer";
import { TYPE_META, TYPE_ORDER, type Task, type TaskAssignment, type TaskType } from "../../lib/tasks";
import { plural } from "../../lib/materials";
import { fmtDayShort } from "../../lib/format";
import { useClassPicker } from "../../components/ClassPicker";

export type TasksResp = { tasks: Task[]; subjects: { id: number; name: string; color: string }[]; mine: { subjectIds: number[]; grades: number[] } };

export const TYPE_ICON: Record<TaskType, JSX.Element> = {
  choice: <ListChecks size={20} />, pairs: <Shuffle size={20} />, gaps: <TextCursorInput size={20} />, order: <ArrowDownUp size={20} />, groups: <Layers size={20} />,
};

/** Мини-иллюстрация типа задания на карточке выбора */
function TypeArt({ type }: { type: TaskType }) {
  switch (type) {
    case "choice": return <span className="ta ta-choice" aria-hidden><i className="on" /><i /><i /></span>;
    case "pairs": return <span className="ta ta-pairs" aria-hidden><i /><i /><b /><b /><em /><em /></span>;
    case "gaps": return <span className="ta ta-gaps" aria-hidden><i /><u /><i /><u /><i /></span>;
    case "order": return <span className="ta ta-order" aria-hidden><i>1</i><i>2</i><i>3</i></span>;
    case "groups": return <span className="ta ta-groups" aria-hidden><i /><i /><s /><s /><s /></span>;
  }
}

/** Конструктор заданий: свои интерактивные задания для урока и доски */
export default function Tasks() {
  useTitle("Конструктор заданий");
  const state = useApi<TasksResp>("/teacher/tasks");
  const nav = useNavigate();
  const toast = useToast();
  const [play, setPlay] = useState<Task | null>(null);
  const [filter, setFilter] = useState<TaskType | "all">("all");
  const [assign, setAssign] = useState<Task | null>(null);
  const [results, setResults] = useState<Task | null>(null);

  async function copy(t: Task) {
    try {
      const c = await api<Task>(`/teacher/tasks/${t.id}/copy`, { method: "POST" });
      toast("Копия создана");
      nav(`/t/tasks/${c.id}`);
    } catch (e) { toast(e instanceof ApiError ? e.message : "Не получилось скопировать", true); }
  }
  async function remove(t: Task) {
    if (!window.confirm(`Удалить задание «${t.title}»? Его нельзя будет восстановить.`)) return;
    try {
      await api(`/teacher/tasks/${t.id}`, { method: "DELETE" });
      state.setData((d) => d && { ...d, tasks: d.tasks.filter((x) => x.id !== t.id) });
      toast("Задание удалено");
    } catch (e) { toast(e instanceof ApiError ? e.message : "Не получилось удалить", true); }
  }

  return (
    <>
      <PageHead title="Конструктор заданий" sub="Интерактивные задания за пару минут: заполните поля — назначьте классу — ученики выполняют, вы видите результаты." />
      <div className="stack" style={{ gap: 20 }}>
        <section aria-label="Создать задание">
          <div className="tk-types">
            {TYPE_ORDER.map((t) => (
              <Link key={t} to={`/t/tasks/new/${t}`} className={`tk-type tk-${t}`}>
                <TypeArt type={t} />
                <span className="tk-type-t">{TYPE_META[t].title}</span>
                <span className="tk-type-d">{TYPE_META[t].text}</span>
                <span className="tk-type-cta"><Plus size={14} /> Создать</span>
              </Link>
            ))}
          </div>
        </section>

        <Load state={state}>
          {(d) => {
            const list = d.tasks.filter((t) => filter === "all" || t.type === filter);
            const types = TYPE_ORDER.filter((t) => d.tasks.some((x) => x.type === t));
            return (
              <NbPage label="Мои задания">
                <NbHead title="Мои задания" hint={`${d.tasks.length} ${plural(d.tasks.length, "задание", "задания", "заданий")}`}
                  right={types.length > 1 ? (
                    <select className="select select-sm" value={filter} onChange={(e) => setFilter(e.target.value as TaskType | "all")} aria-label="Тип задания">
                      <option value="all">Все типы</option>
                      {types.map((t) => <option key={t} value={t}>{TYPE_META[t].title}</option>)}
                    </select>
                  ) : undefined} />
                {list.length === 0 ? (
                  <Empty icon={<Plus size={28} />} title="Пока нет заданий">Выберите тип задания выше — первое задание займёт пару минут.</Empty>
                ) : (
                  <ul className="tk-list">
                    {list.map((t) => (
                      <li key={t.id} className="tk-item">
                        <span className={`tk-ico tk-${t.type}`} aria-hidden>{TYPE_ICON[t.type]}</span>
                        <div className="tk-main">
                          <button type="button" className="tk-name" onClick={() => setPlay(t)}>{t.title}</button>
                          <span className="tk-meta">
                            {t.subject && <span className="cat-dot" style={{ background: t.subject.color }} aria-hidden />}
                            {[t.subject?.name, t.grade ? `${t.grade} класс` : null, TYPE_META[t.type].short,
                              `${t.size} ${plural(t.size ?? 0, ...TYPE_META[t.type].unit)}`,
                              t.assigned ? `назначено: ${t.assigned}` : null,
                              `изменено ${fmtDayShort(t.updatedAt.slice(0, 10))}`].filter(Boolean).join(" · ")}
                          </span>
                        </div>
                        <div className="tk-actions">
                          <button type="button" className="btn btn-sm btn-primary" onClick={() => setAssign(t)}><Send size={14} /> Назначить</button>
                          {(t.assigned ?? 0) > 0 && (
                            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setResults(t)} title="Результаты"><Users size={14} /></button>
                          )}
                          <button type="button" className="btn btn-sm btn-ghost btn-icon" onClick={() => setPlay(t)} aria-label={`Открыть «${t.title}»`} title="Открыть"><Play size={15} /></button>
                          <Link to={`/t/tasks/${t.id}`} className="btn btn-sm btn-ghost btn-icon" aria-label={`Изменить «${t.title}»`} title="Изменить"><Pencil size={15} /></Link>
                          <button type="button" className="btn btn-sm btn-ghost btn-icon" onClick={() => copy(t)} aria-label={`Копировать «${t.title}»`} title="Копировать"><Copy size={15} /></button>
                          <button type="button" className="btn btn-sm btn-ghost btn-icon tk-del" onClick={() => remove(t)} aria-label={`Удалить «${t.title}»`} title="Удалить"><Trash2 size={15} /></button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </NbPage>
            );
          }}
        </Load>
      </div>
      {play && (
        <Modal label={play.title} onClose={() => setPlay(null)}>
          <TaskPlayer type={play.type} title={play.title} data={play.data}
            subtitle={[play.subject?.name, play.grade ? `${play.grade} класс` : null].filter(Boolean).join(" · ") || undefined} />
        </Modal>
      )}
      {assign && (
        <AssignModal task={assign} onClose={() => setAssign(null)} onDone={(n) => {
          state.setData((d) => d && { ...d, tasks: d.tasks.map((x) => x.id === assign.id ? { ...x, assigned: Math.max(x.assigned ?? 0, n) } : x) });
          setAssign(null);
        }} />
      )}
      {results && (
        <ResultsModal task={results} onClose={() => setResults(null)} onChanged={() => state.reload()} />
      )}
    </>
  );
}

function AssignModal({ task, onClose, onDone }: { task: Task; onClose: () => void; onDone: (assignedCount: number) => void }) {
  const toast = useToast();
  const { classes, cls } = useClassPicker({ allowAllSubjects: true });
  const [classId, setClassId] = useState<number | "">("");
  const [dueOn, setDueOn] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const list = classes.data ?? [];

  useEffect(() => {
    if (classId !== "" || !list.length) return;
    const prefer = list.find((c) => task.grade != null && c.grade === task.grade) ?? cls ?? list[0];
    if (prefer) setClassId(prefer.id);
  }, [list, cls, classId, task.grade]);

  async function submit() {
    if (classId === "") return;
    setBusy(true);
    try {
      await api(`/teacher/tasks/${task.id}/assign`, {
        method: "POST",
        body: { classId, dueOn: dueOn || null, note: note.trim() || null },
      });
      const asg = await api<TaskAssignment[]>(`/teacher/tasks/${task.id}/assignments`);
      toast(`Назначено классу ${list.find((c) => c.id === classId)?.name ?? ""}`);
      onDone(asg.length);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Не получилось назначить", true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal label="Назначить классу" onClose={onClose}>
      <div className="stack" style={{ gap: 14, minWidth: "min(420px, 100%)" }}>
        <p className="small muted" style={{ margin: 0 }}>«{task.title}» появится у учеников в разделе «Домашние задания».</p>
        <label className="te-field">
          <span>Класс</span>
          <select className="select" value={classId} onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : "")} disabled={classes.loading}>
            {!list.length && <option value="">Нет классов</option>}
            {list.map((c) => <option key={c.id} value={c.id}>{c.name}{c.homeroom ? " · классное руководство" : ""} · {c.students} уч.</option>)}
          </select>
        </label>
        <label className="te-field">
          <span>Срок сдачи (необязательно)</span>
          <input className="input" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
        </label>
        <label className="te-field">
          <span>Комментарий ученикам</span>
          <input className="input" value={note} maxLength={300} placeholder="Например: к пятнице, без учебника" onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Отмена</button>
          <button type="button" className="btn btn-primary" disabled={busy || classId === ""} onClick={() => void submit()}>
            <Send size={15} /> {busy ? "Назначаю…" : "Назначить"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ResultsModal({ task, onClose, onChanged }: { task: Task; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const asg = useApi<TaskAssignment[]>(`/teacher/tasks/${task.id}/assignments`);
  const [active, setActive] = useState<number | null>(null);
  const results = useApi<{ assignment: TaskAssignment; students: { id: number; name: string; score: number | null; total: number | null; submittedAt: string | null }[] }>(
    active ? `/teacher/tasks/assignments/${active}/results` : null,
  );

  useEffect(() => {
    if (active != null || !asg.data?.length) return;
    setActive(asg.data[0].id);
  }, [asg.data, active]);

  async function remove(a: TaskAssignment) {
    if (!window.confirm(`Снять назначение с класса ${a.class.name}? Результаты учеников тоже удалятся.`)) return;
    try {
      await api(`/teacher/tasks/assignments/${a.id}`, { method: "DELETE" });
      toast("Назначение снято");
      asg.reload();
      onChanged();
      if (active === a.id) setActive(null);
    } catch (e) { toast(e instanceof ApiError ? e.message : "Не получилось снять", true); }
  }

  return (
    <Modal label={`Результаты: ${task.title}`} onClose={onClose}>
      <Load state={asg}>
        {(list) => list.length === 0 ? (
          <Empty title="Ещё не назначалось">Нажмите «Назначить», чтобы отправить задание классу.</Empty>
        ) : (
          <div className="stack" style={{ gap: 14, minWidth: "min(480px, 100%)" }}>
            <div className="row wrap" style={{ gap: 8 }}>
              {list.map((a) => (
                <button key={a.id} type="button" className={`btn btn-sm ${active === a.id ? "btn-primary" : "btn-ghost"}`} onClick={() => setActive(a.id)}>
                  {a.class.name} · {a.done}/{a.students}
                </button>
              ))}
            </div>
            <Load state={results}>
              {(r) => (
                <>
                  <div className="row wrap small muted" style={{ gap: 12 }}>
                    <span>{r.assignment.class.name}</span>
                    {r.assignment.dueOn && <span>до {fmtDayShort(r.assignment.dueOn)}</span>}
                    <span>{r.assignment.done} из {r.assignment.students} сдали</span>
                    <button type="button" className="btn btn-sm btn-ghost tk-del" style={{ marginLeft: "auto" }} onClick={() => remove(r.assignment)}>Снять с класса</button>
                  </div>
                  <ul className="tk-results">
                    {r.students.map((s) => (
                      <li key={s.id} className={s.score == null ? "pending" : ""}>
                        <span>{s.name}</span>
                        <span className="num">{s.score == null ? "не сдано" : `${s.score}/${s.total}`}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Load>
          </div>
        )}
      </Load>
    </Modal>
  );
}
