import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, BookOpen, CheckCheck, ChevronLeft, ChevronRight, Info, Save, SearchX, Undo2,
} from "lucide-react";
import { useApi, useTitle } from "../../lib/hooks";
import { api, ApiError } from "../../lib/api";
import { useToast } from "../../lib/toast";
import { Empty, Load, Mark, Seg } from "../../components/ui";
import { NbHead, NbPage, NbSeg } from "../../components/paper";
import { FlipTag, KindChip, type LessonDTO } from "../../components/LessonCard";
import { ATT_FULL, GRADE_KIND, fmtAvg, fmtDayShort, fmtLong } from "../../lib/format";
import { useViewer } from "../../components/Viewer";
import { FileBadge, materialSub } from "../../components/materials";
import type { Material } from "../../lib/materials";

type Student = { id: number; fullName: string; shortName: string; status: string | null; grades: { value: number; kind: string }[]; quarterAvg: number | null };
type Detail = {
  lesson: LessonDTO; canMark: boolean; students: Student[];
  topics: { id: number; seq: number; section_no: number; section: string; title: string; kind: string }[];
  textbook: { title: string; authors: string | null; url: string | null } | null;
  materials: Material[];
  prevId: number | null; nextId: number | null;
  next: { id: number; date: string; lessonNo: number; topic: LessonDTO["topic"]; flipped: boolean } | null;
};

const ATT = [
  { v: "present", label: "Был", cls: "p" },
  { v: "absent", label: "Н", cls: "a" },
  { v: "excused", label: "Ув", cls: "e" },
  { v: "late", label: "Оп", cls: "l" },
] as const;
const KINDS = ["answer", "independent", "control", "homework"] as const;
type Kind = (typeof KINDS)[number];

export default function TeacherLesson() {
  const { id } = useParams();
  // Без корректного числового id запрос не отправляем (иначе ушёл бы /teacher/lessons/undefined)
  const validId = id && /^\d+$/.test(id) && Number(id) > 0 ? id : null;
  const state = useApi<Detail>(validId ? `/teacher/lessons/${validId}` : null);
  useTitle(!validId ? "Урок не найден" : state.data ? `${state.data.lesson.subject.name} · ${state.data.lesson.className}` : "Урок");
  if (!validId) {
    return (
      <div className="panel" style={{ marginTop: 16 }}>
        <Empty icon={<SearchX size={28} />} title="Урок не найден">
          В ссылке нет номера урока или он указан неверно. Откройте урок из расписания.
          <div style={{ marginTop: 12 }}>
            <Link to="/t/schedule" className="btn btn-sm"><ArrowLeft size={16} /> К расписанию</Link>
          </div>
        </Empty>
      </div>
    );
  }
  return <Load state={state}>{(d) => <Journal key={`${d.lesson.id}`} d={d} reload={state.reload} />}</Load>;
}

function Journal({ d, reload }: { d: Detail; reload: () => void }) {
  const toast = useToast();
  const nav = useNavigate();
  const view = useViewer();
  const l = d.lesson;

  const initialAtt = useMemo(() => Object.fromEntries(d.students.map((s) => [s.id, s.status])), [d]);
  const initialGrades = useMemo(() => {
    const m: Record<string, number | null> = {};
    for (const s of d.students) for (const g of s.grades) m[`${s.id}:${g.kind}`] = g.value;
    return m;
  }, [d]);
  const initialHw = l.homework ?? "";
  const initialTopic = l.topic?.id ?? null;

  // Для незаполненного проведённого урока сразу ставим «Был» всем — учитель отмечает только отсутствующих
  const [att, setAtt] = useState<Record<number, string | null>>(() =>
    d.canMark && !l.marked ? Object.fromEntries(d.students.map((s) => [s.id, s.status ?? "present"])) : initialAtt,
  );
  const [grades, setGrades] = useState<Record<string, number | null>>(initialGrades);
  const [kind, setKind] = useState<Kind>(l.topic?.kind === "control" ? "control" : "answer");
  const [hw, setHw] = useState(initialHw);
  const initialFlip = d.next?.flipped ?? false;
  const [flipNext, setFlipNext] = useState(initialFlip);
  const [topicId, setTopicId] = useState<number | null>(initialTopic);
  const [saving, setSaving] = useState(false);

  const attChanged = d.students.some((s) => att[s.id] !== initialAtt[s.id]);
  const gradeChanges = Object.keys({ ...grades, ...initialGrades }).filter((k) => (grades[k] ?? null) !== (initialGrades[k] ?? null));
  const dirty = attChanged || gradeChanges.length > 0 || hw !== initialHw || topicId !== initialTopic || flipNext !== initialFlip;

  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [dirty]);

  const present = d.students.filter((s) => att[s.id] === "present" || att[s.id] === "late").length;
  const absentNames = d.students.filter((s) => att[s.id] === "absent" || att[s.id] === "excused");
  const topic = d.topics.find((t) => t.id === topicId);
  const lessonMarks = Object.values(grades).filter((v) => v != null).length;
  const avgs = d.students.map((s) => s.quarterAvg).filter((v): v is number => v != null);
  const classAvg = avgs.length ? avgs.reduce((x, y) => x + y, 0) / avgs.length : null;
  const sections = [...new Set(d.topics.map((t) => t.section_no))];

  async function save() {
    setSaving(true);
    try {
      await api(`/teacher/lessons/${l.id}`, {
        method: "PUT",
        body: {
          topicId: topicId !== initialTopic && topicId ? topicId : undefined,
          homework: hw !== initialHw ? hw : undefined,
          nextFlipped: flipNext !== initialFlip ? flipNext : undefined,
          attendance: d.canMark && (attChanged || !l.marked)
            ? d.students.filter((s) => att[s.id]).map((s) => ({ studentId: s.id, status: att[s.id] }))
            : undefined,
          grades: gradeChanges.map((k) => {
            const [sid, kd] = k.split(":");
            return { studentId: Number(sid), kind: kd, value: grades[k] ?? null };
          }),
        },
      });
      toast("Журнал сохранён");
      reload();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Не удалось сохранить", true);
    } finally {
      setSaving(false);
    }
  }

  /** За урок у ученика только одна оценка — при выставлении нового вида остальные сбрасываем */
  function setGrade(sid: number, raw: string) {
    const v = raw.replace(/\D/g, "");
    const n = v === "" ? null : Math.min(10, Math.max(1, Number(v)));
    setGrades((g) => {
      const next = { ...g };
      for (const k of KINDS) next[`${sid}:${k}`] = k === kind ? n : (n != null ? null : g[`${sid}:${k}`] ?? null);
      return next;
    });
    if (n != null && (att[sid] === "absent" || att[sid] === "excused")) setAtt((a) => ({ ...a, [sid]: "present" }));
  }

  /** Н / Ув снимает оценку — отсутствующему оценку не ставят */
  function setAttendance(sid: number, status: string) {
    setAtt((x) => ({ ...x, [sid]: status }));
    if (status === "absent" || status === "excused") {
      setGrades((g) => {
        const next = { ...g };
        for (const k of KINDS) next[`${sid}:${k}`] = null;
        return next;
      });
    }
  }

  function go(target: number | null) {
    if (!target) return;
    if (dirty && !confirm("Есть несохранённые изменения. Перейти без сохранения?")) return;
    nav(`/t/lesson/${target}`);
  }

  return (
    <>
      <div className="row wrap" style={{ margin: "8px 0 4px" }}>
        <Link to="/t/schedule" className="btn btn-ghost btn-sm"><ArrowLeft size={16} /> К расписанию</Link>
        <div className="row" style={{ marginLeft: "auto" }}>
          <button className="btn btn-sm" disabled={!d.prevId} onClick={() => go(d.prevId)}><ChevronLeft size={16} /> Предыдущий урок</button>
          <button className="btn btn-sm" disabled={!d.nextId} onClick={() => go(d.nextId)}>Следующий <ChevronRight size={16} /></button>
        </div>
      </div>

      <div className="page-head" style={{ marginTop: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div className="row wrap" style={{ gap: 10 }}>
            <span className="dot" style={{ background: l.subject.color, width: 12, height: 12 }} />
            <h1>{l.subject.name} · {l.className}</h1>
            <KindChip kind={topic?.kind ?? l.topic?.kind} />
            {l.flipped && <FlipTag full />}
          </div>
          {(topic?.title ?? l.topic?.title) && <p className="lesson-topic">{topic?.title ?? l.topic?.title}</p>}
          <div className="sub">{fmtLong(l.date)} · {l.lessonNo}-й урок, {l.start}–{l.end} · каб. {l.room}</div>
        </div>
      </div>

      <div className="grid dash lesson-grid">
        <NbPage className="journal" label="Журнал урока">
          <NbHead
            title="Журнал"
            hint={d.canMark ? `${present} из ${d.students.length} на уроке` : `${d.students.length} учащихся`}
            right={d.canMark && (
              <button className="btn btn-sm" onClick={() => setAtt(Object.fromEntries(d.students.map((s) => [s.id, "present"])))}>
                <CheckCheck size={15} /> Все на месте
              </button>
            )}
          />
          {!d.canMark && (
            <div className="callout info small" style={{ margin: "12px 0 4px" }}>
              <Info size={16} style={{ flex: "none", marginTop: 2 }} />
              Урок ещё не начался. Посещаемость и оценки можно будет отметить в день урока, а тему и домашнее задание — уже сейчас.
            </div>
          )}
          {d.canMark && (
            <div className="journal-tools">
              <span className="small muted">Ставлю оценку за:</span>
              <NbSeg>
                <Seg label="Вид оценки" value={kind} onChange={setKind} options={KINDS.map((k) => ({ value: k, label: GRADE_KIND[k].replace(" работа", "").replace("Ответ на уроке", "Ответ") }))} />
              </NbSeg>
            </div>
          )}
          <div className="nb-rows">
            <div className="nb-row nb-colhead jr-head" aria-hidden>
              <span className="nb-n">№</span>
              <span>Ученик</span>
              <span className="c-att">Посещаемость</span>
              <span className="c-grade">Оценка</span>
            </div>
            {d.students.map((s, i) => {
              const prior = KINDS.find((k) => k !== kind && grades[`${s.id}:${k}`] != null);
              return (
                <div key={s.id} className="journal-row">
                  <span className="n">{i + 1}</span>
                  <div className="jr-name">
                    <b>{s.fullName.split(" ").slice(0, 2).join(" ")}</b>
                    <div className="jr-meta">
                      ср. балл {fmtAvg(s.quarterAvg)}
                      {prior && (
                        <span className="jr-other" title="За урок уже есть оценка другого вида — новая заменит её">
                          · сейчас <Mark value={grades[`${s.id}:${prior}`]!} kind={prior} size="sm" />
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="att" role="radiogroup" aria-label={`Посещаемость: ${s.shortName}`}>
                    {ATT.map((a) => (
                      <button key={a.v} type="button" className={a.cls} disabled={!d.canMark}
                        aria-pressed={att[s.id] === a.v} title={ATT_FULL[a.v]}
                        onClick={() => setAttendance(s.id, a.v)}>
                        {a.label}
                      </button>
                    ))}
                  </div>
                  <div className="grade-picker">
                    <input
                      className="grade-input" inputMode="numeric" maxLength={2} placeholder=""
                      aria-label={`${GRADE_KIND[kind]}: ${s.shortName}`}
                      disabled={!d.canMark}
                      value={grades[`${s.id}:${kind}`] ?? ""}
                      onChange={(e) => setGrade(s.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "ArrowDown") {
                          e.preventDefault();
                          const inputs = [...document.querySelectorAll<HTMLInputElement>(".grade-input")];
                          inputs[inputs.indexOf(e.currentTarget) + 1]?.focus();
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          const inputs = [...document.querySelectorAll<HTMLInputElement>(".grade-input")];
                          inputs[inputs.indexOf(e.currentTarget) - 1]?.focus();
                        }
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </NbPage>

        <div className="stack">
          <NbPage label="Тема урока">
            <NbHead title="Тема урока" hint={topic ? `урок № ${topic.seq} по программе` : undefined} />
            <div className="nb-fields">
              <div className="field">
                <label htmlFor="topic">Тема по программе</label>
                <select id="topic" className="select" value={topicId ?? ""} onChange={(e) => setTopicId(Number(e.target.value))}>
                  {sections.map((no) => {
                    const items = d.topics.filter((t) => t.section_no === no);
                    return (
                      <optgroup key={no} label={`${no}. ${items[0].section}`}>
                        {items.map((t) => <option key={t.id} value={t.id}>{t.seq}. {t.title}</option>)}
                      </optgroup>
                    );
                  })}
                </select>
                {topic && <span className="small ink-2">Раздел: <b>{topic.section}</b>{l.topic?.paragraph ? ` · ${l.topic.paragraph}` : ""}</span>}
              </div>
              {d.textbook && (
                <button type="button" className="nb-book" disabled={!d.textbook.url} style={{ "--c": l.subject.color } as CSSProperties}
                  onClick={() => d.textbook?.url && view({ title: d.textbook.title, url: d.textbook.url, kind: "pdf", subtitle: d.textbook.authors ?? "Учебник" })}>
                  <span className="nb-cover" aria-hidden>{l.grade}</span>
                  <span style={{ minWidth: 0 }}>
                    <span className="strong small" style={{ display: "block" }}>{d.textbook.title}</span>
                    {d.textbook.authors && <span className="tiny muted" style={{ display: "block" }}>{d.textbook.authors}</span>}
                    {d.textbook.url
                      ? <span className="nb-book-open"><BookOpen size={12} /> Открыть учебник{l.topic?.paragraph ? ` · ${l.topic.paragraph}` : ""}</span>
                      : l.topic?.paragraph ? <span className="tiny muted" style={{ display: "block", marginTop: 4 }}>к уроку: {l.topic.paragraph}</span> : null}
                  </span>
                </button>
              )}
              <div className="field">
                <label htmlFor="hw">Домашнее задание</label>
                <textarea id="hw" className="textarea" rows={flipNext ? 3 : 2} maxLength={500} value={hw} onChange={(e) => setHw(e.target.value)}
                  placeholder={flipNext ? "Что изучить дома к следующему уроку: параграф, видео, вопросы" : "Например: § 5, № 112, 115"} />
              </div>
              {d.next && (
                <label className={`flip-toggle ${flipNext ? "on" : ""}`}>
                  <input type="checkbox" checked={flipNext} onChange={(e) => {
                    const on = e.target.checked;
                    setFlipNext(on);
                    // пустое ДЗ — подставляем шаблон по теме следующего урока, его можно переписать
                    if (on && !hw.trim() && d.next?.topic) {
                      setHw(`Изучите дома новую тему: ${d.next.topic.paragraph ? `${d.next.topic.paragraph} ` : ""}«${d.next.topic.title}» — прочитайте параграф и разберите примеры. На уроке будем решать задачи.`);
                    }
                  }} />
                  <span>
                    <b>Следующий урок — перевёрнутый</b>
                    <small>
                      {fmtDayShort(d.next.date)}{d.next.topic ? ` · ${d.next.topic.title}` : ""}. Новую тему ученики изучают дома по этому ДЗ, на уроке — практика. У них в ДЗ и дневнике появится пометка.
                    </small>
                  </span>
                </label>
              )}
              <div className="hw-preview">
                <span className="hw-preview-label">Так задание появится в дневнике ученика</span>
                <div className="hw-line">
                  <span className="hw-d">Д/з</span>
                  {flipNext && <FlipTag />}
                  {hw.trim() ? <span className="hw-text">{hw}</span> : <span className="hw-empty">не задано</span>}
                </div>
                <p className="nb-foot" style={{ marginTop: 6 }}>{flipNext ? "Ученики смогут проверить себя по новой теме — 3 вопроса." : "Ученики смогут пройти самопроверку по теме урока."}</p>
              </div>
            </div>
          </NbPage>

          <NbPage label="Итог урока">
            <NbHead title="Итог урока" hint={l.marked ? "журнал заполнен" : d.canMark ? "журнал ещё не сохранён" : undefined} />
            <ul className="nb-rows pl-sum">
              <li className="nb-row"><span className="nb-n" /><span>На уроке</span><b>{d.canMark ? `${present} из ${d.students.length}` : "—"}</b></li>
              <li className="nb-row">
                <span className="nb-n" />
                <span>Отсутствуют{absentNames.length > 0 && <>: <span className="journal-absent-names">{absentNames.map((s) => s.shortName).join(", ")}</span></>}</span>
                <b style={{ color: absentNames.length ? "var(--amber)" : undefined }}>{absentNames.length}</b>
              </li>
              <li className="nb-row"><span className="nb-n" /><span>Оценок за урок</span><b>{lessonMarks}</b></li>
              <li className="nb-row"><span className="nb-n" /><span>Средний балл класса за четверть</span><b>{fmtAvg(classAvg)}</b></li>
            </ul>
          </NbPage>

          <NbPage label="Материалы к уроку">
            <NbHead title="Материалы к уроку" hint={`${l.subject.name}, ${l.grade} класс`} />
            {d.materials.length === 0 ? (
              <p className="nb-foot">Видео и аудио по предмету появятся здесь, когда их добавят в разделы «Материалы». <Link to="/t/video">Видеоуроки</Link> · <Link to="/t/audio">Аудио</Link></p>
            ) : (
              <ul className="nb-rows res-rows">
                {d.materials.map((m, i) => (
                  <li key={m.id}>
                    <button type="button" className="nb-row" onClick={() => view({ title: m.title, url: m.url, kind: m.kind, subtitle: materialSub(m, { subject: true }) })}>
                      <span className="nb-n">{i + 1}</span>
                      <FileBadge kind={m.kind} size={30} />
                      <span style={{ minWidth: 0 }}>
                        <span className="nb-title ellipsis" style={{ display: "block" }}>{m.title}</span>
                        <span className="nb-sub ellipsis" style={{ display: "block" }}>{materialSub(m)}</span>
                      </span>
                      <span aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </NbPage>
        </div>
      </div>

      {dirty && (
        <div className="savebar" role="region" aria-label="Несохранённые изменения">
          <span className="small" style={{ flex: 1 }}>
            {!l.marked && d.canMark ? "По умолчанию все отмечены «Был». Отметьте отсутствующих и сохраните журнал" : "Есть несохранённые изменения"}
          </span>
          <button className="btn btn-sm btn-ghost" style={{ color: "inherit" }} onClick={() => { setAtt(initialAtt); setGrades(initialGrades); setHw(initialHw); setTopicId(initialTopic); }}>
            <Undo2 size={15} /> Отменить
          </button>
          <button className="btn btn-sm btn-primary" disabled={saving} onClick={save}><Save size={15} /> {saving ? "Сохраняем…" : "Сохранить"}</button>
        </div>
      )}
    </>
  );
}
