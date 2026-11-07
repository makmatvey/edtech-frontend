import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import { FlipHorizontal2, BookMarked, DoorOpen, PenLine } from "lucide-react";

export type LessonDTO = {
  id: number; date: string; lessonNo: number; start: string; end: string; state: "past" | "now" | "next" | "upcoming";
  classId: number; className: string; grade: number;
  subject: { id: number; code: string; name: string; color: string };
  teacher: string; room: string;
  topic: { id: number; title: string; section: string; sectionNo: number; paragraph: string | null; kind: string; seq: number } | null;
  homework: string | null; marked: boolean; flipped?: boolean;
};

/** Пометка учителя: новую тему ученики изучают дома, на уроке — практика и обсуждение */
export function FlipTag({ full = false }: { full?: boolean }) {
  return (
    <span className="flip-tag" title="Перевёрнутый урок: новую тему изучают дома, на уроке — практика и обсуждение">
      <FlipHorizontal2 size={12} aria-hidden /> {full ? "Перевёрнутый урок" : "перевёрнутый урок"}
    </span>
  );
}

export const STATE_LABEL: Record<string, string> = { now: "Идёт сейчас", next: "Следующий" };

export function KindChip({ kind }: { kind?: string }) {
  if (kind === "control") return <span className="chip chip-red">Контрольная</span>;
  if (kind === "review") return <span className="chip">Закрепление</span>;
  return null;
}

/** Карточка урока: время · предмет/класс · тема по программе · параграф */
export function LessonCard({ l, to, who, side }: { l: LessonDTO; to?: string; who: "teacher" | "student"; side?: ReactNode }) {
  const body = (
    <>
      <div className="lesson-time">
        <b>{l.start}</b>
        <span>{l.lessonNo}-й урок</span>
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="lesson-title">
          {who === "teacher" ? `${l.subject.name} · ${l.className}` : l.subject.name}
          {STATE_LABEL[l.state] && <span className={`chip ${l.state === "now" ? "chip-blue" : ""}`}>{STATE_LABEL[l.state]}</span>}
          <KindChip kind={l.topic?.kind} />
          {l.flipped && <FlipTag />}
        </div>
        <div className="lesson-topic">{l.topic ? l.topic.title : "Тема не назначена"}</div>
        <div className="lesson-meta">
          {l.topic?.paragraph && <span className="chip"><BookMarked size={12} /> {l.topic.paragraph}</span>}
          <span className="chip"><DoorOpen size={12} /> каб. {l.room}</span>
          {who === "student" && <span className="chip">{l.teacher}</span>}
          {who === "teacher" && l.state === "past" && !l.marked && <span className="chip chip-amber"><PenLine size={12} /> журнал не заполнен</span>}
        </div>
      </div>
      {side && <div className="lesson-side">{side}</div>}
    </>
  );
  const cls = `lesson ${l.state === "now" ? "now" : ""} ${l.state === "past" ? "past" : ""}`;
  const style = { "--c": l.subject.color } as CSSProperties;
  return to ? <Link to={to} className={cls} style={style}>{body}</Link> : <div className={cls} style={style}>{body}</div>;
}

/**
 * Уроки дня как линованный лист тетради: время — на полях (слева от красной линии),
 * предмет и тема — в строке, параграф и кабинет — мелко, «идёт сейчас» — пометкой от руки.
 */
export function LessonSheet({ lessons, who, link, side }: {
  lessons: LessonDTO[]; who: "teacher" | "student";
  link?: (l: LessonDTO) => string; side?: (l: LessonDTO) => ReactNode;
}) {
  return (
    <ol className="sheet" aria-label="Уроки">
      {lessons.map((l) => {
        const inner = (
          <>
            <span className="sheet-margin" aria-hidden={false}>
              <b>{l.start}</b>
              <span>{l.lessonNo}-й</span>
            </span>
            <span className="sheet-body">
              <span className="sheet-title">
                <span className="sheet-dot" style={{ background: l.subject.color }} aria-hidden />
                {who === "teacher" ? <>{l.subject.name} <span className="sheet-class">{l.className}</span></> : l.subject.name}
                {l.state === "now" && <em className="sheet-note">идёт сейчас</em>}
                {l.state === "next" && <em className="sheet-note muted-note">следующий</em>}
                {l.flipped && <FlipTag />}
              </span>
              <span className={`sheet-topic ${l.topic?.kind === "control" ? "control" : ""}`}>
                {l.topic ? l.topic.title : "Тема не назначена"}
              </span>
              <span className="sheet-meta">
                {l.topic?.paragraph && <span><BookMarked size={12} aria-hidden /> {l.topic.paragraph}</span>}
                <span><DoorOpen size={12} aria-hidden /> каб. {l.room}</span>
                {who === "student" && <span>{l.teacher}</span>}
                {l.topic?.kind === "review" && <span>закрепление</span>}
                {who === "teacher" && l.state === "past" && !l.marked && <span className="sheet-warn"><PenLine size={12} aria-hidden /> журнал не заполнен</span>}
              </span>
            </span>
            {side && <span className="sheet-side">{side(l)}</span>}
          </>
        );
        const cls = `sheet-row ${l.state === "now" ? "now" : ""} ${l.state === "past" ? "past" : ""}`;
        return (
          <li key={l.id}>
            {link ? <Link to={link(l)} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>}
          </li>
        );
      })}
    </ol>
  );
}
