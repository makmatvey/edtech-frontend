import { useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Check, ChevronDown, CircleDot, PenLine } from "lucide-react";
import { useApi, useTitle } from "../../lib/hooks";
import { useClassPicker } from "../../components/ClassPicker";
import { Load, Metric, PageHead } from "../../components/ui";
import { NbPage } from "../../components/paper";
import { fmtNum } from "../../lib/format";
import { useViewer } from "../../components/Viewer";

type Topic = { id: number; seq: number; sectionNo: number; title: string; paragraph: string | null; kind: string; lessonId: number | null; date: string | null; status: "done" | "unmarked" | "today" | "planned" | "unscheduled" };
type Data = {
  className: string; total: number; done: number; due: number; behind: number;
  textbook: { title: string; authors: string | null; url: string | null } | null;
  sections: { no: number; title: string; hours: number; done: number; topics: Topic[] }[];
};

const STATUS: Record<Topic["status"], { icon: JSX.Element | null; label: string }> = {
  done: { icon: <Check size={15} color="var(--green)" aria-hidden />, label: "Проведён" },
  unmarked: { icon: <PenLine size={14} aria-hidden />, label: "Заполнить журнал" },
  today: { icon: <CircleDot size={14} aria-hidden />, label: "Сегодня" },
  planned: { icon: null, label: "Запланирован" },
  unscheduled: { icon: null, label: "Во II полугодии" },
};

export default function TeacherProgram() {
  useTitle("Программа");
  const { cls, subject, picker } = useClassPicker({ allowAllSubjects: false });
  const path = cls && subject ? `/teacher/curriculum?classId=${cls.id}&subjectId=${subject.id}` : null;
  const state = useApi<Data>(path);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const view = useViewer();

  return (
    <>
      <PageHead title="Учебная программа (КТП)" sub="Календарно-тематическое планирование: тема на каждый урок, параграф учебника и отметка о проведении." actions={picker} />
      {cls && !subject ? (
        <NbPage><p className="muted" style={{ padding: "6px 0" }}>В этом классе вы ведёте только классное руководство — выберите класс, где у вас есть уроки.</p></NbPage>
      ) : (
        <Load state={state}>
          {(d) => {
            const current = d.sections.find((s) => s.topics.some((t) => t.status === "today" || t.status === "planned"))?.no;
            return (
              <div className="stack">
                <div className="grid cols-4">
                  <Metric label="Проведено по программе" value={`${d.done} из ${d.total}`} foot="уроков с заполненным журналом" />
                  <Metric label="Должно быть к сегодня" value={d.due} foot="по календарному плану" />
                  <Metric label="Отставание" value={d.behind} tone={d.behind > 0 ? "warn" : "good"} foot={d.behind > 0 ? "незаполненные прошедшие уроки" : "идёте по плану"} />
                  {d.textbook ? (
                    <button type="button" className="panel metric metric-btn" disabled={!d.textbook.url}
                      onClick={() => d.textbook?.url && view({ title: d.textbook.title, url: d.textbook.url, kind: "pdf", subtitle: d.textbook.authors ?? "Учебник" })}>
                      <div className="metric-label"><BookOpen size={15} /> Учебник</div>
                      <div className="strong" style={{ marginTop: 4 }}>{d.textbook.title}</div>
                      <div className="metric-foot">{d.textbook.url ? "Открыть PDF" : d.textbook.authors ?? "учебник по программе"}</div>
                    </button>
                  ) : <Metric label="Учебник" value="—" />}
                </div>

                <NbPage className="ktp" label={`КТП · ${d.className}`}>
                  {d.sections.map((s) => {
                    const isOpen = open[s.no] ?? s.no === current;
                    const pct = s.hours ? Math.min(100, Math.round((s.done / s.hours) * 100)) : 0;
                    return (
                      <section key={s.no} className="ktp-sec">
                        <h2 className="ktp-h">
                          <button type="button" className="ktp-toggle" style={{ "--p": `${pct}%` } as CSSProperties}
                            aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [s.no]: !isOpen }))}>
                            <span className="ktp-no">Раздел {s.no}</span>
                            <span className="ktp-title">{s.title}</span>
                            <span className="ktp-hours">проведено {s.done} из {s.hours} ч</span>
                            <ChevronDown size={16} className="ktp-chev" aria-hidden />
                          </button>
                        </h2>
                        {isOpen && (
                          <ol className="nb-rows ktp-rows">
                            <li className="nb-row nb-colhead" aria-hidden>
                              <span className="nb-n">№</span><span>Тема урока</span><span>Параграф</span><span>Дата</span><span>Отметка</span>
                            </li>
                            {s.topics.map((t) => {
                              const st = STATUS[t.status];
                              const inner = (
                                <>
                                  <span className="nb-n">{t.seq}</span>
                                  <span style={{ minWidth: 0 }}>
                                    <span className={`k-title ${t.kind === "control" ? "nb-ctl" : ""}`} style={{ display: "block" }}>{t.title}</span>
                                    <span className="nb-sub k-mob">{[t.paragraph, t.date ? fmtNum(t.date) : null].filter(Boolean).join(" · ")}</span>
                                  </span>
                                  <span className="k-par">{t.paragraph ?? "—"}</span>
                                  <span className="k-date">{t.date ? fmtNum(t.date) : "—"}</span>
                                  <span className={`k-st ${t.status}`} title={st.label}>
                                    {st.icon}
                                    <span className={st.icon ? "k-st-label" : undefined}>{st.label.toLowerCase()}</span>
                                  </span>
                                </>
                              );
                              const cls = `nb-row ${t.status === "today" ? "is-today" : ""}`;
                              return (
                                <li key={t.id}>
                                  {t.lessonId ? <Link to={`/t/lesson/${t.lessonId}`} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>}
                                </li>
                              );
                            })}
                          </ol>
                        )}
                      </section>
                    );
                  })}
                </NbPage>
              </div>
            );
          }}
        </Load>
      )}
    </>
  );
}
