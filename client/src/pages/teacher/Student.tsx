import { type CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, CalendarCheck, Flame, GraduationCap, SearchX, Target, UserX } from "lucide-react";
import { useApi, useTitle } from "../../lib/hooks";
import { useAuth } from "../../lib/auth";
import { Empty, Load, Mark, Metric, SubjectTag } from "../../components/ui";
import { NbHead, NbPage } from "../../components/paper";
import { Sparkline } from "../../components/charts";
import { GRADE_KIND, fmtAvg, fmtDayShort, fmtPct, gradeTone, plural, relDay } from "../../lib/format";

type Grade = { value: number; kind: string; date: string; topic: string | null };
type Card = {
  id: number; fullName: string; shortName: string; login: string; className: string; classId: number; homeroom: boolean;
  average: number | null; attendanceRate: number | null; unexcused: number; missed: number;
  streak: number; lastActivity: string | null; quizzes: number; accuracy: number | null;
  subjects: { id: number; name: string; color: string; average: number | null; grades: Grade[]; lessons: number; absent: number; excused: number }[];
};

const attTone = (r: number | null) => (r == null ? undefined : r >= 92 ? "good" : "warn"); // красным — только оценки

export default function TeacherStudent() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const api = useApi<Card>(id && /^\d+$/.test(id) ? `/teacher/students/${id}` : null);
  // При переходе к другому ученику не показываем карточку предыдущего
  const state = { ...api, data: api.data && String(api.data.id) === id ? api.data : null };
  useTitle(state.data?.fullName ?? "Ученик");
  const back = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate("/t/performance"));

  const notFound = (id && !/^\d+$/.test(id)) || (!state.data && /не найден|закрепл|доступ/i.test(api.error ?? ""));
  if (notFound) {
    return (
      <>
        <button type="button" className="btn btn-sm btn-ghost back-btn" onClick={back}><ArrowLeft size={16} /> Назад</button>
        <div className="panel">
          <Empty icon={<SearchX size={28} />} title={api.error && !/не найден/i.test(api.error) ? api.error : "Ученик не найден"}>
            Возможно, ссылка устарела или ученик не из ваших классов. Найдите его через поиск — <kbd className="kbd">Ctrl</kbd> <kbd className="kbd">K</kbd>.
          </Empty>
        </div>
      </>
    );
  }

  return (
    <>
      <button type="button" className="btn btn-sm btn-ghost back-btn" onClick={back}><ArrowLeft size={16} /> Назад</button>
      <Load state={state}>
        {(s) => {
          const parts = s.fullName.split(" ");
          const withGrades = s.subjects.filter((x) => x.grades.length);
          const concern = (s.attendanceRate != null && s.attendanceRate < 85) || s.unexcused >= 4 || (s.average != null && s.average < 5);
          return (
            <div className="stack">
              <div className="student-head">
                <div style={{ minWidth: 0 }}>
                  <div className="student-label">{s.className} класс</div>
                  <h1>{parts.slice(0, 2).join(" ")} <span className="student-patronymic">{parts.slice(2).join(" ")}</span></h1>
                  <div className="row wrap student-meta">
                    <span className="small muted">логин <b className="ink-2">{s.login}</b></span>
                    <span className="small muted">· активность: {s.lastActivity ? relDay(s.lastActivity, user!.today) : "ещё не начинал"}</span>
                    {s.homeroom && <span className="small muted">· вы — классный руководитель</span>}
                  </div>
                </div>
              </div>

              {concern && (
                <div className="callout warn" role="note">
                  <AlertTriangle size={18} style={{ flex: "none", marginTop: 2 }} />
                  <div className="small">
                    <b>Нужно внимание.</b>{" "}
                    {[
                      s.attendanceRate != null && s.attendanceRate < 85 ? `посещаемость ${fmtPct(s.attendanceRate)}` : null,
                      s.unexcused >= 4 ? `${s.unexcused} ${plural(s.unexcused, "пропуск", "пропуска", "пропусков")} без уважительной причины` : null,
                      s.average != null && s.average < 5 ? `средний балл ${fmtAvg(s.average)}` : null,
                    ].filter(Boolean).join(", ")}. Стоит поговорить с учеником и родителями.
                  </div>
                </div>
              )}

              <div className="grid cols-5">
                <Metric icon={<GraduationCap size={15} />} label="Средний балл" value={fmtAvg(s.average, 2)} tone={gradeTone(s.average)}
                  foot={`${withGrades.reduce((a, x) => a + x.grades.length, 0)} оценок с 1 сентября`} />
                <Metric icon={<CalendarCheck size={15} />} label="Посещаемость" value={fmtPct(s.attendanceRate)} tone={attTone(s.attendanceRate)}
                  foot={`пропущено ${s.missed} ${plural(s.missed, "урок", "урока", "уроков")}`} />
                <Metric icon={<UserX size={15} />} label="Без причины" value={s.unexcused} tone={s.unexcused ? "warn" : "good"} foot="отметки «Н»" />
                <Metric icon={<Flame size={15} />} label="Стрик" value={s.streak}
                  foot={s.streak ? `${plural(s.streak, "день", "дня", "дней")} подряд` : "серии нет"} />
                <Metric icon={<Target size={15} />} label="Точность квизов" value={s.accuracy == null ? "—" : `${s.accuracy}%`}
                  tone={s.accuracy == null ? undefined : s.accuracy >= 75 ? "good" : "warn"}
                  foot={s.quizzes ? `${s.quizzes} ${plural(s.quizzes, "квиз", "квиза", "квизов")} за 30 дней` : "квизов за 30 дней нет"} />
              </div>

              <NbPage label="По предметам">
                <NbHead title="По предметам" hint={s.homeroom ? "все предметы класса" : "ваши предметы"} />
                {s.subjects.length === 0 ? (
                  <Empty title="Нет предметов">У вас нет уроков в этом классе.</Empty>
                ) : (
                  <div className="subj-table" role="table" aria-label="Оценки и посещаемость по предметам">
                    <div className="subj-row subj-headrow" role="row">
                      <span role="columnheader">Предмет</span>
                      <span role="columnheader">Оценки красной ручкой</span>
                      <span role="columnheader">Динамика</span>
                      <span role="columnheader" className="right">Средний</span>
                      <span role="columnheader" className="right">Посещаемость</span>
                    </div>
                    {s.subjects.map((x) => {
                      const missed = x.absent + x.excused;
                      return (
                        <div className="subj-row" role="row" key={x.id} style={{ "--c": x.color } as CSSProperties}>
                          <span role="cell" className="subj-name"><SubjectTag name={x.name} color={x.color} /></span>
                          <span role="cell" className="subj-marks">
                            {x.grades.length ? (
                              <span className="marks">
                                {x.grades.map((g, i) => (
                                  <Mark key={i} value={g.value} kind={g.kind} size="sm"
                                    title={`${fmtDayShort(g.date)} · ${GRADE_KIND[g.kind] ?? g.kind}${g.topic ? ` · ${g.topic}` : ""}`} />
                                ))}
                              </span>
                            ) : <span className="muted small">оценок пока нет</span>}
                          </span>
                          <span role="cell" className="subj-spark">
                            {x.grades.length >= 2 ? <Sparkline values={x.grades.slice(-10).map((g) => g.value)} width={84} height={26} /> : <span className="muted tiny">—</span>}
                          </span>
                          <span role="cell" className={`subj-avg num ${gradeTone(x.average)}`}>{fmtAvg(x.average)}</span>
                          <span role="cell" className="subj-att small">
                            <span className="num">{x.lessons} {plural(x.lessons, "урок", "урока", "уроков")}</span>
                            {missed ? (
                              <span className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
                                {x.absent > 0 && <span className="reg-mark inline a" title="без уважительной причины">н {x.absent}</span>}
                                {x.excused > 0 && <span className="reg-mark inline e" title="по уважительной причине">ув {x.excused}</span>}
                              </span>
                            ) : <span className="muted">без пропусков</span>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="nb-foot">Обведённая оценка — контрольная, подчёркнутая — самостоятельная. Наведите на оценку, чтобы увидеть дату и тему урока.</p>
              </NbPage>
            </div>
          );
        }}
      </Load>
    </>
  );
}
