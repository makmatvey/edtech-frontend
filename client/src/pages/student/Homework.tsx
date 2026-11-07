import { useCallback, useState, type CSSProperties } from "react";
import { ListChecks, Puzzle } from "lucide-react";
import { useApi, useTitle } from "../../lib/hooks";
import { useAuth } from "../../lib/auth";
import { api, ApiError } from "../../lib/api";
import { useToast } from "../../lib/toast";
import { Empty, Load, Modal, PageHead, Panel, Progress, Seg } from "../../components/ui";
import { Quiz } from "../../components/Quiz";
import { TaskPlayer } from "../../components/TaskPlayer";
import { FlipTag } from "../../components/LessonCard";
import { fmtDayShort, relDay } from "../../lib/format";
import { CheckCircle2 } from "lucide-react";
import { TYPE_META, type StudentTask } from "../../lib/tasks";

type Item = {
  lessonId: number; givenOn: string; dueOn: string | null; done: boolean; canCheck: boolean; text: string;
  subject: { name: string; color: string }; topic: { title: string; paragraph: string | null } | null;
  flipped: boolean; newTopic: { title: string; paragraph: string | null } | null;
};

type Group = { key: string; title: string; tone?: "blue"; items: Item[] };

/** Группы по дню сдачи: «Сегодня», «Завтра», «Пн, 9 ноя»… (сервер отдаёт задания только с сегодняшнего дня) */
function groupByDue(items: Item[], today: string): Group[] {
  const groups = new Map<string, Group>();
  for (const it of items) {
    const key = it.dueOn ? `1-${it.dueOn}` : "9-next";
    const day = it.dueOn ? relDay(it.dueOn, today) : "";
    const title = !it.dueOn ? "К следующему уроку" : day[0].toUpperCase() + day.slice(1);
    const g = groups.get(key) ?? { key, title, tone: it.dueOn === today ? "blue" : undefined, items: [] };
    g.items.push(it);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export default function StudentHomework() {
  useTitle("Домашние задания");
  const { user } = useAuth();
  const toast = useToast();
  const state = useApi<{ items: Item[] }>("/student/homework");
  const tasks = useApi<{ items: StudentTask[] }>("/student/tasks");
  const [filter, setFilterRaw] = useState<"todo" | "done" | "all">("todo");
  const [check, setCheck] = useState<Item | null>(null);
  const [play, setPlay] = useState<StudentTask | null>(null);
  const [playData, setPlayData] = useState<{ type: StudentTask["type"]; title: string; data: any; subject: StudentTask["subject"] } | null>(null);
  const [busy, setBusy] = useState<Set<number>>(() => new Set());
  // Задания, отмеченные на этой странице, остаются на месте до смены фильтра — видно галочку и можно передумать
  const [touched, setTouched] = useState<Set<number>>(() => new Set());
  // Строки, где анимация отметки должна проиграться (только по действию ученика, не при загрузке)
  const [just, setJust] = useState<Set<number>>(() => new Set());

  const setFilter = (f: typeof filter) => { setTouched(new Set()); setFilterRaw(f); };

  const openTask = async (t: StudentTask) => {
    try {
      const full = await api<{ type: StudentTask["type"]; title: string; data: any; subject: StudentTask["subject"] }>(`/student/tasks/${t.id}`);
      setPlay(t);
      setPlayData(full);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Не получилось открыть задание", true);
    }
  };

  const onTaskComplete = useCallback(async (r: { ok: number; total: number }) => {
    if (!play) return;
    try {
      await api(`/student/tasks/${play.id}/submit`, { method: "POST", body: { score: r.ok, total: r.total } });
      tasks.setData((d) => d && {
        items: d.items.map((x) => x.id === play.id ? { ...x, done: true, score: r.ok, total: r.total, submittedAt: new Date().toISOString() } : x),
      });
      toast(r.ok === r.total ? "Отлично! Результат сохранён" : `Сохранено: ${r.ok} из ${r.total}`);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Не получилось сохранить результат", true);
    }
  }, [play, tasks, toast]);
  const setDone = (id: number, done: boolean) =>
    state.setData((d) => d && { items: d.items.map((x) => (x.lessonId === id ? { ...x, done } : x)) });
  const withId = (s: Set<number>, id: number, on: boolean) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; };

  async function toggle(it: Item) {
    if (busy.has(it.lessonId)) return;
    const id = it.lessonId, next = !it.done;
    setDone(id, next); // сразу, без ожидания сервера
    setTouched((s) => withId(s, id, true));
    setJust((s) => withId(s, id, next));
    setBusy((s) => withId(s, id, true));
    try {
      await api(`/student/homework/${id}`, { method: "PUT", body: { done: next } });
    } catch (e) {
      setDone(id, !next);
      setJust((s) => withId(s, id, false));
      toast(e instanceof ApiError ? e.message : "Не получилось сохранить отметку", true);
    } finally {
      setBusy((s) => withId(s, id, false));
    }
  }

  /** Самопроверка засчитывает задание — оно остаётся на месте и отмечается с той же анимацией, что и вручную */
  async function afterCheck(it: Item) {
    setCheck(null);
    try {
      const fresh = await api<{ items: Item[] }>("/student/homework");
      const nowDone = fresh.items.find((x) => x.lessonId === it.lessonId)?.done;
      if (nowDone && !it.done) {
        setTouched((s) => withId(s, it.lessonId, true));
        // кадр паузы: окно закрылось, строка видна — и только тогда галочка «ставится»
        await new Promise((r) => setTimeout(r, 180));
        setJust((s) => withId(s, it.lessonId, true));
      }
      state.setData(fresh);
    } catch {
      state.reload();
    }
  }

  return (
    <>
      <PageHead
        title="Домашние задания"
        sub="Задания с урока и интерактивные из конструктора. Самопроверка по теме засчитывает день в стрик."
        actions={<Seg label="Фильтр" value={filter} onChange={setFilter} options={[{ value: "todo", label: "Нужно сделать" }, { value: "done", label: "Выполнено" }, { value: "all", label: "Все" }]} />}
      />
      <Load state={state}>
        {(d) => {
          const today = user!.today;
          const interactive = (tasks.data?.items ?? []).filter((x) => filter === "all" || (filter === "done" ? x.done : !x.done));
          const items = d.items
            .filter((x) => filter === "all" || touched.has(x.lessonId) || (filter === "done" ? x.done : !x.done))
            .sort((a, b) => (a.dueOn ?? "9").localeCompare(b.dueOn ?? "9"));
          const groups = groupByDue(items, today);
          const total = d.items.length + (tasks.data?.items.length ?? 0);
          const doneN = d.items.filter((x) => x.done).length + (tasks.data?.items.filter((x) => x.done).length ?? 0);
          const bySubject = [...d.items.reduce((m, x) => {
            const s = m.get(x.subject.name) ?? { name: x.subject.name, color: x.subject.color, done: 0, total: 0 };
            s.total++; if (x.done) s.done++;
            return m.set(x.subject.name, s);
          }, new Map<string, { name: string; color: string; done: number; total: number }>()).values()].sort((a, b) => a.done / a.total - b.done / b.total);

          return (
            <div className="grid dash">
              <div className="stack" style={{ gap: 22 }}>
                {interactive.length > 0 && (
                  <section aria-label="Интерактивные задания">
                    <div className="section-title hw-head">
                      <h2>Интерактивные</h2>
                      <span className="hint">{interactive.length}</span>
                    </div>
                    <ul className="sheet hw-sheet">
                      {interactive.map((t) => (
                        <li key={`t${t.id}`}>
                          <div className={`sheet-row hw-row ${t.done ? "done" : ""}`} style={{ "--c": t.subject?.color ?? "var(--accent)" } as CSSProperties}>
                            <span className="sheet-margin hw-margin">
                              <span className={`hw-check ${t.done ? "on" : ""}`} aria-hidden>
                                <Puzzle size={16} />
                              </span>
                            </span>
                            <span className="sheet-body">
                              <span className="sheet-title">
                                {t.subject && <span className="sheet-dot" style={{ background: t.subject.color }} aria-hidden />}
                                {t.subject?.name ?? "Задание"}
                                <span className="tiny muted" style={{ fontWeight: 400 }}>{TYPE_META[t.type].short}</span>
                              </span>
                              <span className="hw-text"><span className="hw-ink">{t.title}</span></span>
                              <span className="sheet-meta">
                                {t.dueOn ? <span>сдать {relDay(t.dueOn, today)}</span> : <span>без срока</span>}
                                {t.done && t.score != null && <span>результат {t.score}/{t.total}</span>}
                                {t.note && <span>{t.note}</span>}
                              </span>
                            </span>
                            <span className="sheet-side">
                              <button className="btn btn-sm btn-primary" onClick={() => void openTask(t)}>
                                <Puzzle size={15} /> {t.done ? "Ещё раз" : "Выполнить"}
                              </button>
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {groups.length === 0 && interactive.length === 0 && (
                  <div className="panel"><Empty icon={<CheckCircle2 size={30} color="var(--green)" />} title={filter === "todo" ? "Все задания выполнены" : "Здесь пока пусто"}>{filter === "todo" ? "Можно пройти квиз дня, чтобы сохранить стрик." : null}</Empty></div>
                )}
                {groups.map((g) => (
                  <section key={g.key} aria-label={g.title}>
                    <div className={`section-title hw-head ${g.tone ?? ""}`}>
                      <h2>{g.title}</h2>
                      <span className="hint">{g.items.length} {g.items.length === 1 ? "задание" : g.items.length < 5 ? "задания" : "заданий"}</span>
                    </div>
                    <ul className="sheet hw-sheet">
                      {g.items.map((it) => (
                        <li key={it.lessonId}>
                          <div className={`sheet-row hw-row ${it.done ? "done" : ""} ${it.done && just.has(it.lessonId) ? "just" : ""}`} style={{ "--c": it.subject.color } as CSSProperties}>
                            <span className="sheet-margin hw-margin">
                              <button type="button" className={`hw-check ${it.done ? "on" : ""}`} aria-pressed={it.done}
                                aria-label={`${it.subject.name}: ${it.done ? "снять отметку" : "отметить выполненным"}`}
                                aria-busy={busy.has(it.lessonId)} onClick={() => toggle(it)}>
                                <svg className="hw-tick" viewBox="0 0 24 24" aria-hidden>
                                  <path d="M5 12.8l4.4 4.4L19.2 7.4" pathLength={1} />
                                </svg>
                                {it.done && just.has(it.lessonId) && (
                                  <span className="hw-burst" aria-hidden>
                                    {Array.from({ length: 8 }, (_, i) => <i key={i} style={{ "--a": `${i * 45 + 22}deg` } as CSSProperties} />)}
                                  </span>
                                )}
                              </button>
                            </span>
                            <span className="sheet-body">
                              <span className="sheet-title">
                                <span className="sheet-dot" style={{ background: it.subject.color }} aria-hidden />
                                {it.subject.name}
                                {it.flipped && <FlipTag />}
                                {filter !== "todo" && it.dueOn && <span className="tiny muted" style={{ fontWeight: 400 }}>сдать {relDay(it.dueOn, today)}</span>}
                              </span>
                              <span className="hw-text"><span className="hw-ink">{it.text}</span></span>
                              <span className="sheet-meta">
                                {it.flipped && <span>новая тема — изучить дома</span>}
                                <span>задано {fmtDayShort(it.givenOn)}</span>
                              </span>
                            </span>
                            {it.canCheck && (
                              <span className="sheet-side">
                                <button className="btn btn-sm" onClick={() => setCheck(it)}><ListChecks size={15} /> Проверить себя</button>
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>

              <div className="stack side-sticky">
                <Panel className="note" title="Текущие задания" pad>
                  <div className="hw-total">
                    <span className="hw-total-n">{doneN}</span>
                    <span className="muted">из {total} выполнено</span>
                  </div>
                  <Progress value={doneN} max={total} label="Выполнено домашних заданий" />
                  <div className="row wrap small" style={{ gap: 16, marginTop: 14 }}>
                    <span><b className="num">{total - doneN}</b> <span className="muted">осталось</span></span>
                  </div>
                </Panel>
                <Panel className="note hide-sm" title="По предметам" pad>
                  <div className="stack" style={{ gap: 12 }}>
                    {bySubject.map((s) => (
                      <div key={s.name}>
                        <div className="row small" style={{ marginBottom: 5 }}>
                          <span className="sheet-dot" style={{ background: s.color }} aria-hidden />
                          <span className="grow">{s.name}</span>
                          <span className="num muted">{s.done} / {s.total}</span>
                        </div>
                        <Progress value={s.done} max={s.total} color={s.color} label={`${s.name}: выполнено ${s.done} из ${s.total}`} />
                      </div>
                    ))}
                  </div>
                </Panel>
                <Panel className="note hide-sm" title="Самопроверка" pad>
                  <p className="small" style={{ margin: 0 }}>
                    Три вопроса по теме урока, к которому задано ДЗ. Если два ответа и больше верны, день засчитывается в стрик, так же как квиз дня.
                  </p>
                </Panel>
              </div>
            </div>
          );
        }}
      </Load>
      {check && (
        <Modal label="Самопроверка" onClose={() => { setCheck(null); state.reload(); }}>
          <Quiz startPath={`/student/homework/${check.lessonId}/check`} title={`Самопроверка: ${check.subject.name}`} onClose={() => afterCheck(check)} />
        </Modal>
      )}
      {play && playData && (
        <Modal label={playData.title} onClose={() => { setPlay(null); setPlayData(null); tasks.reload(); }}>
          <TaskPlayer
            type={playData.type}
            title={playData.title}
            data={playData.data}
            subtitle={playData.subject?.name}
            onComplete={onTaskComplete}
          />
        </Modal>
      )}
    </>
  );
}
