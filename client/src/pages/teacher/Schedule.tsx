import { FlipTag } from "../../components/LessonCard";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarCheck2, ChevronLeft, ChevronRight, PenLine } from "lucide-react";
import { useApi, useTitle } from "../../lib/hooks";
import { useAuth } from "../../lib/auth";
import { Load, PageHead, Seg } from "../../components/ui";
import { NbHead, NbPage, NbSeg } from "../../components/paper";
import type { LessonDTO } from "../../components/LessonCard";
import { addDays, fmtDay, fmtDayShort, weekdayName } from "../../lib/format";

type Day = { date: string; schoolDay: boolean; lessons: LessonDTO[] };
type Week = { week: string; prev: string; next: string; days: Day[] };

export function WeekNav({ week, prev, next, onChange, today }: { week: string; prev: string; next: string; onChange: (w: string) => void; today: string }) {
  const thisWeek = week <= today && today <= addDays(week, 6);
  return (
    <div className="row">
      <button className="btn btn-icon" onClick={() => onChange(prev)} aria-label="Предыдущая неделя"><ChevronLeft size={18} /></button>
      <span className="strong num" style={{ minWidth: 150, textAlign: "center" }}>{fmtDayShort(week)} — {fmtDayShort(addDays(week, 4))}</span>
      <button className="btn btn-icon" onClick={() => onChange(next)} aria-label="Следующая неделя"><ChevronRight size={18} /></button>
      {!thisWeek && <button className="btn" onClick={() => onChange(today)}><CalendarCheck2 size={16} /> Эта неделя</button>}
    </div>
  );
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** День планера: строки по номерам уроков, свободные уроки («окна») остаются пустыми линейками. */
function PlanDay({ day, rows, cls, today }: { day: Day; rows: number; cls: string; today: string }) {
  const lessons = day.lessons.filter((l) => cls === "all" || l.className === cls);
  const isToday = day.date === today;
  // Только до последнего урока дня: «окна» между уроками видны, пустые строки в конце не занимают место
  const slots = Array.from({ length: Math.max(0, ...lessons.map((l) => l.lessonNo)) }, (_, i) => lessons.filter((l) => l.lessonNo === i + 1));
  void rows;
  const name = cap(weekdayName(day.date));
  const last = Math.max(0, ...lessons.map((l) => l.lessonNo));
  return (
    <section aria-label={`${name}, ${fmtDay(day.date)}`}>
      <header className={`nb-head ${isToday ? "is-today" : ""}`}>
        <h2>{name}</h2>
        <span className="nb-hint">{fmtDay(day.date)}</span>
        {isToday && <em className="nb-right nb-hand">сегодня</em>}
      </header>
      {!day.schoolDay ? (
        <div className="pl-holiday">каникулы</div>
      ) : (
        slots.length === 0 ? <div className="pl-holiday">уроков нет</div> :
        <ol className="nb-rows pl-rows">
          {slots.map((ls, i) => ls.length === 0 ? (
            <li key={`e${i}`} className={`nb-row ${i + 1 > last ? "trail" : ""}`}>
              <span className="nb-n">{i + 1}</span>
              <span className="sr-only">нет урока</span>
            </li>
          ) : ls.map((l) => {
            const control = l.topic?.kind === "control";
            const unmarked = l.state === "past" && !l.marked;
            return (
              <li key={l.id}>
                <Link to={`/t/lesson/${l.id}`} className={`nb-row pl-row ${l.state === "now" ? "now" : ""} ${l.state === "past" ? "past" : ""}`}>
                  <span className="nb-n">{l.lessonNo}</span>
                  <span className="pl-cls"><b>{l.className}</b><span>{l.start}</span></span>
                  <span className="pl-body">
                    <span className={`pl-topic ${control ? "nb-ctl" : ""}`}>{l.topic?.title ?? "Тема не назначена"}</span>
                    <span className="nb-sub">
                      {l.subject.name}{l.topic?.paragraph ? ` · ${l.topic.paragraph}` : ""} · каб. {l.room}
                      {l.state === "now" ? " · идёт сейчас" : ""}
                      {l.flipped && <> · <FlipTag /></>}
                    </span>
                  </span>
                  <span className="pl-st">
                    {unmarked && <PenLine size={15} color="var(--amber)" aria-label="Журнал не заполнен" />}
                  </span>
                </Link>
              </li>
            );
          }))}
        </ol>
      )}
    </section>
  );
}

export default function TeacherSchedule() {
  useTitle("Расписание и темы");
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const week = params.get("week") ?? user!.today;
  const state = useApi<Week>(`/teacher/schedule?week=${week}`);
  const [cls, setCls] = useState<string>("all");

  return (
    <>
      <PageHead
        title="Расписание и темы уроков"
        sub="Планер недели: на каждый урок — тема по учебной программе и параграф. Нажмите на урок, чтобы открыть журнал."
        actions={state.data && <WeekNav {...state.data} today={user!.today} onChange={(w) => setParams({ week: w })} />}
      />
      <Load state={state}>
        {(d) => {
          const classes = [...new Set(d.days.flatMap((x) => x.lessons.map((l) => l.className)))].sort();
          const all = d.days.flatMap((x) => x.lessons).filter((l) => cls === "all" || l.className === cls);
          const rows = Math.max(6, ...all.map((l) => l.lessonNo));
          const controls = all.filter((l) => l.topic?.kind === "control");
          const unmarked = all.filter((l) => l.state === "past" && !l.marked).length;
          const shown = cls === "all" ? classes : [cls];
          return (
            <>
              {classes.length > 1 && (
                <div style={{ marginBottom: 14 }}>
                  <NbSeg>
                    <Seg label="Класс" value={cls} onChange={setCls} options={[{ value: "all", label: "Все классы" }, ...classes.map((c) => ({ value: c, label: c }))]} />
                  </NbSeg>
                </div>
              )}
              <div className="planner">
                <NbPage as="div">
                  {d.days.slice(0, 3).map((day) => <PlanDay key={day.date} day={day} rows={rows} cls={cls} today={user!.today} />)}
                </NbPage>
                <NbPage as="div">
                  {d.days.slice(3).map((day) => <PlanDay key={day.date} day={day} rows={rows} cls={cls} today={user!.today} />)}
                  <section aria-label="Итоги недели">
                    <NbHead title="Итоги недели" />
                    <ul className="nb-rows pl-sum">
                      <li className="nb-row"><span className="nb-n" /><span>Уроков</span><b>{all.length}</b></li>
                      <li className="nb-row"><span className="nb-n" /><span>Классы</span><b>{shown.join(", ") || "—"}</b></li>
                      <li className="nb-row">
                        <span className="nb-n" />
                        <span>Контрольных работ{controls.length ? ` · ${controls.map((l) => `${l.className}, ${fmtDayShort(l.date)}`).join("; ")}` : ""}</span>
                        <b className={controls.length ? "nb-ctl" : ""}>{controls.length}</b>
                      </li>
                      <li className="nb-row">
                        <span className="nb-n" />
                        <span className="pl-legend">Журналов не заполнено <span><PenLine size={13} color="var(--amber)" aria-hidden /></span></span>
                        <b style={{ color: unmarked ? "var(--amber)" : undefined }}>{unmarked}</b>
                      </li>
                    </ul>
                  </section>
                </NbPage>
              </div>
            </>
          );
        }}
      </Load>
    </>
  );
}
