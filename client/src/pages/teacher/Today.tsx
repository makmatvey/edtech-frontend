import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpenCheck, CheckCircle2, CalendarX2, Check, Copy, FileWarning, Flame, GraduationCap, KeyRound, PenLine, Target, Users } from "lucide-react";
import { useApi, useTitle } from "../../lib/hooks";
import { useAuth } from "../../lib/auth";
import { Avatar, Empty, Load, Metric, PageHead, Panel } from "../../components/ui";
import { LessonSheet, type LessonDTO } from "../../components/LessonCard";
import { BarRow } from "../../components/charts";
import { fmtAvg, fmtPct, lessonsWord, relDay, fmtNum } from "../../lib/format";
import { useToast } from "../../lib/toast";
import type { TeacherClass } from "../../components/ClassPicker";

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Запасной путь: старые браузеры и небезопасный контекст
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

/** Код классного руководителя: по нему ученики сами присоединяются к классу при регистрации. */
function JoinCodePanel() {
  const classes = useApi<TeacherClass[]>("/teacher/classes");
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const hr = classes.data?.find((c) => c.homeroom && c.joinCode);
  if (!hr?.joinCode) return null;
  const code = hr.joinCode;
  const copy = async () => {
    if (await copyText(code)) {
      toast("Код скопирован");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else toast("Не удалось скопировать — выделите код вручную", true);
  };
  return (
    <Panel className="note" title={<span className="row"><KeyRound size={16} color="var(--blue)" /> Код класса для учеников</span>} hint={hr.name}>
      <div className="panel-pad join-code-box">
        <div className="join-code">{code}</div>
        <button type="button" className="btn btn-sm" onClick={copy} aria-live="polite">
          {copied ? <Check size={15} color="var(--green)" /> : <Copy size={15} />}
          {copied ? "Скопировано" : "Копировать"}
        </button>
        <p className="small muted join-code-hint">Ученики вводят его при регистрации</p>
      </div>
    </Panel>
  );
}

type Dash = {
  date: string; isSchoolDay: boolean; quarter: number;
  today: (LessonDTO & { presentCount: number; attendanceTotal: number; gradesCount: number })[];
  unmarked: LessonDTO[];
  attention: { id: number; name: string; className: string; reasons: string[] }[];
  controls: LessonDTO[];
  weak: { classId: number; className: string; subject: string; color: string; section: string; accuracy: number; total: number }[];
  stats: { avgGrade: number | null; attendance: number | null; lessonsDone: number };
};

type Todo = { key: string; tone: "red" | "amber" | "blue"; icon: ReactNode; title: string; sub: string; to: string; action: string };

/** Ссылка на конструктор с готовой заготовкой задания по слабой теме */
const taskFor = (w: { subject: string; section: string; className: string }) =>
  `/t/tasks/new/choice?${new URLSearchParams({ title: `Повторение: ${w.section}`, subject: w.subject, grade: String(parseInt(w.className, 10) || "") })}`;

const addDaysIso = (iso: string, n: number) => { const x = new Date(`${iso}T12:00:00`); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };

/** «Нужно сделать»: всё, что требует действия учителя, одним списком — сначала журнал, потом контрольные и темы */
function TodoPanel({ d }: { d: Dash }) {
  const [all, setAll] = useState(false);
  const journals = [...d.today.filter((l) => l.state === "past" && !l.marked), ...d.unmarked];
  const items: Todo[] = [
    ...journals.map((l): Todo => ({
      key: `j${l.id}`, tone: "red", icon: <PenLine size={16} />,
      title: `Заполните журнал: ${l.subject.name} · ${l.className}`,
      sub: `${l.date === d.date ? "сегодня" : relDay(l.date, d.date)}, ${l.lessonNo}-й урок${l.topic ? ` · ${l.topic.title}` : ""}`,
      to: `/t/lesson/${l.id}`, action: "Заполнить",
    })),
    ...d.controls.filter((l) => l.date <= addDaysIso(d.date, 3)).map((l): Todo => ({
      key: `c${l.id}`, tone: "amber", icon: <FileWarning size={16} />,
      title: `Контрольная ${l.date === d.date ? "сегодня" : relDay(l.date, d.date)}: ${l.subject.name} · ${l.className}`,
      sub: l.topic?.title ?? "", to: `/t/lesson/${l.id}`, action: "Открыть",
    })),
    ...d.weak.filter((w) => w.accuracy < 60).map((w): Todo => ({
      key: `w${w.classId}${w.section}`, tone: "blue", icon: <BookOpenCheck size={16} />,
      title: `Повторите тему «${w.section}» в ${w.className}`,
      sub: `${w.subject}: ${w.accuracy}% верных ответов в квизах за 2 недели`, to: taskFor(w), action: "Собрать задание",
    })),
  ];
  const shown = all ? items : items.slice(0, 4);
  return (
    <section className="todo" aria-labelledby="todo-h">
      <div className="todo-head">
        <h2 id="todo-h">Нужно сделать</h2>
        {items.length > 0 && <span className="todo-count">{items.length}</span>}
      </div>
      {items.length === 0 ? (
        <div className="todo-empty"><CheckCircle2 size={20} /> Всё сделано: журналы заполнены, срочных дел нет.</div>
      ) : (
        <ul className="todo-list">
          {shown.map((t) => (
            <li key={t.key}>
              <Link to={t.to} className={`todo-item ${t.tone}`}>
                <span className="todo-ic" aria-hidden>{t.icon}</span>
                <span className="todo-txt"><b>{t.title}</b>{t.sub && <small>{t.sub}</small>}</span>
                <span className="todo-act">{t.action} <ArrowRight size={14} /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {items.length > 4 && (
        <button type="button" className="todo-more" onClick={() => setAll((v) => !v)}>{all ? "Свернуть" : `Показать ещё ${items.length - 4}`}</button>
      )}
    </section>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер";
}

export default function TeacherToday() {
  useTitle("Сегодня");
  const { user } = useAuth();
  const state = useApi<Dash>("/teacher/dashboard");
  const name = user?.fullName.split(" ").slice(1).join(" ") ?? "";

  return (
    <Load state={state}>
      {(d) => {
        const left = d.today.filter((l) => l.state !== "past").length;
        const unfilled = d.today.filter((l) => l.state === "past" && !l.marked).length + d.unmarked.length;
        return (
          <>
            <PageHead
              title={`${greeting()}, ${name}`}
              sub={d.isSchoolDay
                ? d.today.length ? `Сегодня ${lessonsWord(d.today.length)}${left ? `, впереди ${left}` : ", все проведены"}.` : "Сегодня у вас нет уроков."
                : "Сегодня выходной — можно спокойно спланировать неделю."}
            />

            <TodoPanel d={d} />

            <div className="grid cols-4" style={{ marginBottom: 20 }}>
              <Metric icon={<GraduationCap size={15} />} label={`Средний балл, ${d.quarter} четв.`} value={fmtAvg(d.stats.avgGrade, 2)} foot="по всем вашим классам" />
              <Metric icon={<Users size={15} />} label="Посещаемость" value={fmtPct(d.stats.attendance)} tone={d.stats.attendance == null ? undefined : d.stats.attendance < 90 ? "warn" : "good"} foot="ваши уроки в четверти" />
              <Metric icon={<Target size={15} />} label="Проведено уроков" value={d.stats.lessonsDone} foot={`в ${d.quarter}-й четверти`} />
              <Metric icon={<PenLine size={15} />} label="Журнал не заполнен" value={unfilled} tone={unfilled ? "bad" : "good"} foot={unfilled ? "уроков — см. «Нужно сделать»" : "всё заполнено"} />
            </div>

            <div className="grid dash">
              <div className="stack">
                <div className="section-title"><h2>Уроки сегодня</h2><span className="hint">тема каждого урока — по учебной программе</span></div>
                {d.today.length === 0 ? (
                  <div className="panel"><Empty icon={<CalendarX2 size={28} />} title={d.isSchoolDay ? "Уроков нет" : "Выходной день"}>
                    Расписание на неделю с темами — в разделе <Link to="/t/schedule">«Расписание»</Link>.
                  </Empty></div>
                ) : (
                  <LessonSheet lessons={d.today} who="teacher" link={(l) => `/t/lesson/${l.id}`}
                    side={(l) => {
                      const x = l as Dash["today"][number];
                      return x.marked
                        ? <span className="chip chip-green">{x.presentCount}/{x.attendanceTotal} на уроке</span>
                        : <span className="btn btn-sm btn-primary">{l.state === "upcoming" || l.state === "next" ? "Открыть" : "Журнал"} <ArrowRight size={14} /></span>;
                    }} />
                )}
                <Panel className="note" title="Что класс не понял" hint="квизы, 14 дн." right={<Link to="/t/activity" className="small">Подробнее</Link>}>
                  {d.weak.length === 0 ? (
                    <Empty icon={<Flame size={24} />} title="Пока мало ответов">Данные появятся, когда ученики пройдут несколько квизов дня.</Empty>
                  ) : (
                    <div className="panel-pad weak-grid">
                      {d.weak.map((w) => (
                        <div key={`${w.classId}-${w.section}`}>
                          <div className="small muted">{w.subject} · {w.className}</div>
                          <BarRow label={<span className="strong">{w.section}</span>} value={w.accuracy} max={100}
                            color={w.accuracy < 60 ? "var(--red)" : w.accuracy < 75 ? "var(--amber)" : "var(--green)"} display={`${w.accuracy}%`} />
                          {w.accuracy < 60 && <Link to={taskFor(w)} className="tiny weak-act">Собрать задание на повторение →</Link>}
                        </div>
                      ))}
                      <p className="tiny muted weak-foot">Доля верных ответов по разделу программы. Ниже 60 % — тему стоит повторить на уроке.</p>
                    </div>
                  )}
                </Panel>

              </div>

              <div className="stack">
                <Panel className="note" title="Кому нужна помощь" hint="ваши уроки, эта четверть">
                  {d.attention.length === 0 ? (
                    <Empty icon={<CheckCircle2 size={24} color="var(--green)" />} title="Отстающих нет">Ни у кого нет среднего балла ниже 5 и частых пропусков.</Empty>
                  ) : (
                    <div className="list">
                      {d.attention.map((a) => (
                        <Link key={a.id} to={`/t/student/${a.id}`} className="list-item">
                          <Avatar name={a.name} id={a.id} size={30} />
                          <div className="grow">
                            <div className="strong small ellipsis">{a.name} <span className="muted">· {a.className}</span></div>
                            <div className="small muted ellipsis">{a.reasons.join("; ")}</div>
                          </div>
                          <ArrowRight size={16} className="muted" />
                        </Link>
                      ))}
                    </div>
                  )}
                </Panel>

                <Panel className="note" title="Контрольные работы" hint="ближайшие 3 недели">
                  {d.controls.length === 0 ? (
                    <Empty title="Контрольных не запланировано" />
                  ) : (
                    <div className="list">
                      {d.controls.map((l) => (
                        <Link key={l.id} to={`/t/lesson/${l.id}`} className="list-item">
                          <span className="chip chip-red num" style={{ minWidth: 52, justifyContent: "center" }}>{fmtNum(l.date)}</span>
                          <div className="grow">
                            <div className="strong small ellipsis">{l.subject.name} · {l.className}</div>
                            <div className="small muted ellipsis">{l.topic?.title}</div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </Panel>
                <JoinCodePanel />
              </div>
            </div>
          </>
        );
      }}
    </Load>
  );
}
