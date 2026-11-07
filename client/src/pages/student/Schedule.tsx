import { useEffect, useRef, useState, type CSSProperties } from "react";
import { FlipTag } from "../../components/LessonCard";
import { useSearchParams } from "react-router-dom";
import { BookOpen, CheckCircle2, ClipboardList, X } from "lucide-react";
import { useApi, useTitle } from "../../lib/hooks";
import { useEscapeLayer } from "../../lib/layers";
import { useAuth } from "../../lib/auth";
import { Load, Mark, PageHead } from "../../components/ui";
import type { LessonDTO } from "../../components/LessonCard";
import { WeekNav } from "../teacher/Schedule";
import { ATT_LABEL, fmtAvg, fmtDay, weekdayName } from "../../lib/format";

type L = LessonDTO & { myGrades: { value: number; kind: string }[]; myStatus: string | null; homeworkDone: boolean };
type Day = { date: string; schoolDay: boolean; lessons: L[] };
type Week = { week: string; prev: string; next: string; days: Day[] };


const KIND_LABEL: Record<string, string> = { control: "Контрольная работа", review: "Закрепление", regular: "Новая тема" };
const cleanTitle = (t: string) => {
  const s = t.replace(/^(Контрольная работа|Кантрольная работа|Test): /, "").replace(/^Закрепление: /, "");
  return s[0].toUpperCase() + s.slice(1);
};

/** Тема урока — значок в строке дневника; по нажатию открывается карточка-закладка с крупной разборчивой надписью */
function TopicNote({ l }: { l: L }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  // Esc закрывает карточку темы, только если она верхний слой (палитра поверх неё закроется первой)
  useEscapeLayer(open, () => { setOpen(false); btn.current?.focus(); });
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  if (!l.topic) return null;
  const control = l.topic.kind === "control";
  const kind = KIND_LABEL[l.topic.kind] ?? "Тема урока";
  return (
    <span className="d-note" ref={box}>
      <button ref={btn} type="button" className={`d-note-btn ${control ? "control" : ""} ${open ? "on" : ""}`} onClick={() => setOpen((o) => !o)}
        aria-expanded={open} aria-label={`${kind}: ${cleanTitle(l.topic.title)}`} title={control ? "Контрольная — открыть тему" : "Тема урока"}>
        {control ? <ClipboardList size={15} /> : <BookOpen size={15} />}
        {control && <span>к/р</span>}
      </button>
      {open && (
        <span className={`d-note-card ${control ? "control" : ""}`} role="dialog" aria-label="Тема урока" style={{ "--c": l.subject.color } as CSSProperties}>
          <span className="d-note-top">
            <span className="d-note-kind">{kind}</span>
            <button type="button" className="d-note-x" onClick={() => setOpen(false)} aria-label="Закрыть"><X size={14} /></button>
          </span>
          <b className="d-note-title">{cleanTitle(l.topic.title)}</b>
          <span className="d-note-meta">{l.subject.name}{l.topic.paragraph ? ` · ${/§/.test(l.topic.paragraph) ? "" : "§ "}${l.topic.paragraph}` : ""}</span>
          {l.topic.section && <span className="d-note-meta">Раздел: {l.topic.section}</span>}
        </span>
      )}
    </span>
  );
}

function DiaryDay({ day, today }: { day: Day; today: string }) {
  const rows = Array.from({ length: Math.max(day.lessons.length ? 0 : 1, day.lessons.length) }, (_, i) => day.lessons[i] ?? null); // без пустых строк в конце дня
  const name = weekdayName(day.date);
  return (
    <section className={`diary-day ${day.date === today ? "is-today" : ""}`} aria-label={`${name}, ${fmtDay(day.date)}`}>
      <header className="diary-day-head">
        <b>{name[0].toUpperCase() + name.slice(1)}</b>
        <span>{fmtDay(day.date)}</span>
        {day.date === today && <em>сегодня</em>}
      </header>
      {!day.schoolDay ? (
        <div className="diary-holiday">каникулы</div>
      ) : (
        <div className="diary-rows" role="table" aria-label="Уроки">
          {rows.map((l, i) => (
            <div key={l?.id ?? `e${i}`} className={`diary-row ${l?.state === "now" ? "now" : ""}`} role="row">
              <span className="d-no" role="cell">{l ? l.lessonNo : ""}</span>
              <span className="d-subj" role="cell">
                {l && <>
                  <span className="d-subj-name">{l.subject.name}</span>
                  {l.flipped && <FlipTag />}
                  <span className="d-time">{l.start} · каб. {l.room}</span>
                </>}
              </span>
              <span className="d-task" role="cell">
                {l && <>
                  <TopicNote l={l} />
                  {l.homework && (
                    <span className={`d-hw ${l.homeworkDone ? "done" : ""}`}>
                      {l.homeworkDone && <CheckCircle2 size={12} aria-label="выполнено" />} {l.homework}
                    </span>
                  )}
                </>}
              </span>
              <span className="d-mark" role="cell">
                {l?.myGrades.map((g, k) => <Mark key={k} value={g.value} kind={g.kind} />)}
                {l && (l.myStatus === "absent" || l.myStatus === "excused" || l.myStatus === "late") && <span className="d-att">{ATT_LABEL[l.myStatus]}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function StudentSchedule() {
  useTitle("Дневник");
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const week = params.get("week") ?? user!.today;
  const state = useApi<Week>(`/student/schedule?week=${week}`);

  return (
    <>
      <PageHead
        title="Дневник"
        sub="Домашние задания и оценки, как в бумажном дневнике. Тема урока — под значком книги, нажмите, чтобы открыть."
        actions={state.data && <WeekNav {...state.data} today={user!.today} onChange={(w) => setParams({ week: w })} />}
      />
      <Load state={state}>
        {(d) => {
          const marks = d.days.flatMap((x) => x.lessons.flatMap((l) => l.myGrades.map((g) => g.value)));
          const avg = marks.length ? marks.reduce((a, b) => a + b, 0) / marks.length : null;
          const hwTotal = d.days.flatMap((x) => x.lessons).filter((l) => l.homework).length;
          const hwDone = d.days.flatMap((x) => x.lessons).filter((l) => l.homework && l.homeworkDone).length;
          return (
            <div className="diary">
              <div className="diary-page left">
                {d.days.slice(0, 3).map((day) => <DiaryDay key={day.date} day={day} today={user!.today} />)}
              </div>
              <div className="diary-page right">
                {d.days.slice(3).map((day) => <DiaryDay key={day.date} day={day} today={user!.today} />)}
                <section className="diary-day diary-notes" aria-label="Итоги недели">
                  <header className="diary-day-head"><b>Итоги недели</b></header>
                  <div className="diary-notes-body">
                    <p><span>Оценок</span><b className="num">{marks.length}</b></p>
                    <p><span>Средний балл</span><b className="num">{fmtAvg(avg)}</b></p>
                    <p><span>Домашних заданий выполнено</span><b className="num">{hwDone} из {hwTotal}</b></p>
                  </div>
                </section>
              </div>
            </div>
          );
        }}
      </Load>
    </>
  );
}
