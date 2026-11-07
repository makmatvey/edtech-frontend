import { FlipTag } from "../../components/LessonCard";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, CalendarX2, FileText, CheckCircle2, GraduationCap, NotebookPen, Users } from "lucide-react";
import { useApi, useTitle } from "../../lib/hooks";
import { useAuth } from "../../lib/auth";
import { Empty, Load, Mark, Metric, Modal, PageHead, Panel, SubjectTag } from "../../components/ui";
import { LessonSheet, type LessonDTO } from "../../components/LessonCard";
import { StreakStrip } from "../../components/StreakHero";
import { Quiz } from "../../components/Quiz";
import { BarRow } from "../../components/charts";
import { fmtAvg, fmtDayShort, fmtPct, relDay } from "../../lib/format";
import { useViewer } from "../../components/Viewer";

type Library = { textbooks: { key: string; title: string; authors: string | null; url: string | null; subject_code: string; subject: string; color: string }[] };

/** Учебники к урокам дня: предмет → электронный учебник с нужным параграфом */
function TodayBooks({ lessons }: { lessons: LessonDTO[] }) {
  const lib = useApi<Library>("/student/library");
  const view = useViewer();
  if (!lib.data) return null;
  const seen = new Set<number>();
  const rows = lessons.filter((l) => !seen.has(l.subject.id) && seen.add(l.subject.id))
    .map((l) => ({ l, tb: lib.data!.textbooks.find((t) => t.subject_code === l.subject.code) }))
    .filter((x) => x.tb?.url);
  if (rows.length === 0) return null;
  return (
    <Panel className="note" title="Учебники к урокам" right={<Link to="/s/library" className="small">Все</Link>}>
      <div className="list">
        {rows.map(({ l, tb }) => (
          <button type="button" key={l.subject.id} className="list-item list-btn" onClick={() => view({ title: tb!.title, url: tb!.url!, kind: "pdf", subtitle: l.topic?.paragraph ?? tb!.authors ?? "Учебник" })}>
            <BookOpen size={18} style={{ color: l.subject.color, flex: "none" }} aria-hidden />
            <div className="grow">
              <div className="strong small ellipsis">{tb!.title}</div>
              <div className="tiny muted ellipsis">{l.topic?.paragraph ? `${l.topic.paragraph} · ` : ""}{l.topic?.title ?? tb!.authors}</div>
            </div>
            <FileText size={15} className="muted" aria-hidden />
          </button>
        ))}
      </div>
    </Panel>
  );
}

type Overview = {
  date: string; isSchoolDay: boolean; className: string; quarter: number;
  today: LessonDTO[]; nextDay: string | null; upcoming: LessonDTO[];
  average: number | null; attendanceRate: number | null;
  recentGrades: { value: number; kind: string; date: string; subject: string; color: string; topic: string | null }[];
  subjects: { id: number; name: string; color: string; average: number | null; count: number }[];
  homework: { lessonId: number; givenOn: string; dueOn: string | null; subject: { name: string; color: string }; text: string; topic: { title: string } | null; flipped?: boolean }[];
  homeworkLeft: number;
  streak: { current: number; todayDone: boolean; atRisk: boolean; xp: number; week: { date: string; status: string }[]; nextBadge: { title: string; days: number } | null;
    dailySize: number; classToday: { done: number; total: number }; rank: { place: number; of: number; ahead: { name: string; streak: number } | null } };
};

export default function StudentHome() {
  useTitle("Главная");
  const { user } = useAuth();
  const state = useApi<Overview>("/student/overview");
  const [quiz, setQuiz] = useState(false);
  const first = user?.fullName.split(" ")[1] ?? user?.shortName;

  return (
    <Load state={state}>
      {(d) => {
        const lessons = d.nextDay ? d.upcoming : d.today;
        return (
          <>
            <PageHead title={`Привет, ${first}!`} sub={`${d.className} класс · ${d.quarter}-я четверть`} />
            <div className="stack" style={{ gap: 20 }}>
              <StreakStrip {...d.streak} onStart={() => setQuiz(true)} />

              <div className="grid cols-4">
                <Metric icon={<GraduationCap size={15} />} label="Средний балл" value={fmtAvg(d.average, 2)} foot={`за ${d.quarter}-ю четверть`} />
                <Metric icon={<Users size={15} />} label="Посещаемость" value={fmtPct(d.attendanceRate)} foot="в этой четверти" />
                <Metric icon={<NotebookPen size={15} />} label="Домашних заданий" value={d.homeworkLeft} foot={d.homeworkLeft ? "ждут выполнения" : "всё сделано"} tone={d.homeworkLeft ? undefined : "good"} />
                <Metric label="Опыт" value={`${d.streak.xp} XP`} foot="за квизы и самопроверки" />
              </div>

              <div className="grid dash">
                <div className="stack">
                  <div className="section-title">
                    <h2>{d.nextDay ? `Уроки ${relDay(d.nextDay, d.date)}` : "Уроки сегодня"}</h2>
                    <span className="hint">тема каждого урока — по программе</span>
                    <Link to="/s/schedule" className="right small">Вся неделя</Link>
                  </div>
                  {lessons.length === 0 ? (
                    <div className="panel"><Empty icon={<CalendarX2 size={28} />} title="Уроков нет">Отдохните — а квиз дня можно пройти и в выходной.</Empty></div>
                  ) : <LessonSheet lessons={lessons} who="student" />}
                  <Panel className="note" title="Домашние задания" right={<Link to="/s/homework" className="small">{d.homeworkLeft > d.homework.length ? `Все ${d.homeworkLeft}` : "Все"}</Link>}>
                    {d.homework.length === 0 ? (
                      <Empty icon={<CheckCircle2 size={26} color="var(--green)" />} title="Всё выполнено" />
                    ) : (
                      <div className="list list-2">
                        {d.homework.map((h) => (
                          <Link key={h.lessonId} to="/s/homework" className="list-item">
                            <div className="grow">
                              <span className="row" style={{ gap: 8 }}>
                                <SubjectTag name={h.subject.name} color={h.subject.color} className="small" />
                                {h.flipped && <FlipTag />}
                              </span>
                              <div className="small ellipsis">{h.text}</div>
                              {h.dueOn && h.dueOn < d.date
                                ? <div className="tiny" style={{ color: "var(--red)" }}>срок был {relDay(h.dueOn, d.date)}</div>
                                : <div className="tiny muted">к {h.dueOn ? relDay(h.dueOn, d.date) : "следующему уроку"}</div>}
                            </div>
                            <ArrowRight size={16} className="muted" />
                          </Link>
                        ))}
                      </div>
                    )}
                  </Panel>

                </div>

                <div className="stack">
                  <Panel className="note" title="Последние оценки" right={<Link to="/s/grades" className="small">Все оценки</Link>}>
                    {d.recentGrades.length === 0 ? <Empty title="Оценок пока нет" /> : (
                      <div className="list">
                        {d.recentGrades.slice(0, 4).map((g, i) => (
                          <div key={i} className="list-item" style={{ padding: "10px 20px" }}>
                            <Mark value={g.value} kind={g.kind} />
                            <div className="grow">
                              <SubjectTag name={g.subject} color={g.color} className="small" />
                              <div className="tiny muted ellipsis">{fmtDayShort(g.date)} · {g.topic}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Panel>

                  <TodayBooks lessons={lessons} />


                  {d.subjects.length > 0 && (
                    <Panel className="note" title="Средний балл по предметам" pad>
                      <div className="stack" style={{ gap: 10 }}>
                        {d.subjects.map((s) => <BarRow key={s.id} label={s.name} value={s.average} max={10} color={s.color} display={fmtAvg(s.average)} />)}
                      </div>
                    </Panel>
                  )}
                </div>
              </div>
            </div>
            {quiz && (
              <Modal label="Квиз дня" onClose={() => { setQuiz(false); state.reload(); }}>
                <Quiz startPath="/student/quiz/daily" title="Квиз дня" onClose={() => { setQuiz(false); state.reload(); }} />
              </Modal>
            )}
          </>
        );
      }}
    </Load>
  );
}
