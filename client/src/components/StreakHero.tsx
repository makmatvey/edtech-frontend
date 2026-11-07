import { ArrowRight, Award, Check, Play, Snowflake, Trophy, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Flame } from "./Flame";
import { useStreak, setStreak } from "../lib/streak";
import { useEffect, useState } from "react";
import { days, weekdayShort } from "../lib/format";

type Day = { date: string; status: string };

/** «Живое» состояние: квиз обновляет его мгновенно, даже пока страница не перезагрузила данные */
function useLiveStreak(current: number, todayDone: boolean, atRisk: boolean, week: Day[]) {
  const live = useStreak(false);
  useEffect(() => { setStreak({ current, todayDone, atRisk }); }, [current, todayDone, atRisk]);
  if (live) ({ current, todayDone, atRisk } = live);
  const today = week.find((d) => d.status === "today");
  if (todayDone && today) week = week.map((d) => (d === today ? { ...d, status: "done" } : d));
  return { current, todayDone, atRisk, week };
}

export function StreakHero({ current, todayDone, atRisk, week, onStart, nextBadge, compact = false }: {
  current: number; todayDone: boolean; atRisk: boolean; week: Day[]; onStart: () => void;
  nextBadge?: { title: string; days: number } | null; compact?: boolean;
}) {
  ({ current, todayDone, atRisk, week } = useLiveStreak(current, todayDone, atRisk, week));
  const tone = todayDone ? "done" : atRisk ? "at-risk" : "";
  const headline = todayDone
    ? "Сегодня выполнено — так держать!"
    : atRisk
      ? "Пройдите квиз до конца дня, чтобы не потерять серию"
      : current
        ? "Продолжите серию сегодня"
        : "Начните серию — 5 вопросов по пройденным темам";
  return (
    <section className={`streak-hero ${tone}`} aria-label="Ежедневный стрик">
      <div className="grid-lines" aria-hidden />
      <div className="row" style={{ alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 220px" }}>
          <div className="row wrap" style={{ gap: 8 }}>
            <span className="small strong" style={{ opacity: 0.9 }}>Ежедневный стрик</span>
            {atRisk && <span className="risk-flag">под угрозой</span>}
          </div>
          <div className="row" style={{ alignItems: "flex-end", gap: 12, marginTop: 10 }}>
            <Flame lit={todayDone} size={compact ? 52 : 68} />
            <span className="streak-count">{current}</span>
            <span style={{ fontSize: 18, fontWeight: 600, paddingBottom: 6 }}>{days(current).replace(/^\d+ /, "")} подряд</span>
          </div>
          <p style={{ marginTop: 8, fontSize: 15, opacity: 0.95 }}>{headline}</p>
          {nextBadge && !compact && <p className="small" style={{ marginTop: 4, opacity: 0.8 }}>До значка «{nextBadge.title}» — {days(nextBadge.days - current)}</p>}
        </div>
        <div className="stack" style={{ gap: 14, alignItems: "flex-end", marginLeft: "auto" }}>
          <div className="week-dots" aria-label="Последние 7 дней">
            {week.map((d) => (
              <span key={d.date} className={`week-dot ${d.status}`} title={d.date}>
                <i>{d.status === "done" ? <Check size={15} /> : d.status === "frozen" ? <Snowflake size={13} /> : null}</i>
                {weekdayShort(d.date)}
              </span>
            ))}
          </div>
          {!todayDone ? (
            <button className="btn btn-lg" onClick={onStart}><Play size={16} /> Пройти квиз дня</button>
          ) : (
            <button className="btn" onClick={onStart}>Потренироваться ещё</button>
          )}
        </div>
      </div>
    </section>
  );
}

type StripExtra = {
  nextBadge?: { title: string; days: number } | null;
  dailySize?: number;
  classToday?: { done: number; total: number };
  rank?: { place: number; of: number; ahead: { name: string; streak: number } | null };
};

/** Сколько осталось до полуночи — серия сгорает в конце дня */
function useUntilMidnight() {
  const calc = () => {
    const n = new Date();
    const m = new Date(n); m.setHours(24, 0, 0, 0);
    const mins = Math.max(0, Math.floor((m.getTime() - n.getTime()) / 60000));
    return { h: Math.floor(mins / 60), m: mins % 60 };
  };
  const [left, setLeft] = useState(calc);
  useEffect(() => { const t = setInterval(() => setLeft(calc()), 30000); return () => clearInterval(t); }, []);
  return left;
}

/**
 * Плашка стрика на главной ученика: одно понятное действие и три причины сделать его сейчас —
 * время до полуночи, одноклассники, которые уже прошли квиз, и ближайшая цель (место в классе, значок).
 */
export function StreakStrip({ current, todayDone, atRisk, week, onStart, nextBadge, dailySize = 5, classToday, rank }: {
  current: number; todayDone: boolean; atRisk: boolean; week: Day[]; onStart: () => void;
} & StripExtra) {
  const wasDone = todayDone;
  ({ current, todayDone, atRisk, week } = useLiveStreak(current, todayDone, atRisk, week));
  const left = useUntilMidnight();
  const tone = todayDone ? "done" : atRisk ? "at-risk" : current ? "" : "fresh";
  const word = (n: number) => days(n).replace(/^\d+ /, "");
  // квиз только что пройден на этой странице — себя тоже считаем в «прошли сегодня»
  const classDone = classToday ? classToday.done + (todayDone && !wasDone ? 1 : 0) : 0;

  const kicker = todayDone ? "Квиз дня пройден" : atRisk ? "Серия под угрозой" : current ? "Квиз дня" : "Ежедневный квиз";
  const head = todayDone
    ? <>Огонёк горит — {days(current)} подряд!</>
    : atRisk
      ? <>Не дайте огоньку погаснуть</>
      : current
        ? <>Продолжите серию: {days(current)}</>
        : <>Зажгите огонёк сегодня</>;
  const sub = todayDone
    ? <>Завтра будет {days(current + 1)} — загляните хотя бы на 2 минуты.</>
    : atRisk
      ? <>Серия обнулится в полночь — а это уже {days(current)} подряд. Осталось <b className="num">{left.h} ч {String(left.m).padStart(2, "0")} мин</b>.</>
      : current
        ? <>Квиз засчитывается и в выходные — серия не прервётся.</>
        : <>{dailySize} вопросов по темам, которые вы уже прошли. С первого квиза начнётся серия.</>;
  const badgeLeft = nextBadge ? nextBadge.days - current : 0;

  return (
    <section className={`streak-strip v2 ${tone}`} aria-label="Ежедневный стрик">
      <div className="ss-top">
        <div className="ss-flame">
          <Flame lit={todayDone} size={52} label="" />
          <span className="ss-big num">{current}</span>
          <span className="ss-big-l">{word(current)}</span>
        </div>
        <div className="ss-main">
          <span className="ss-kicker">{kicker}</span>
          <h2 className="ss-head">{head}</h2>
          <p className="ss-sub">{sub}</p>
        </div>
        <div className="ss-cta">
          {todayDone ? (
            <>
              <Link to="/s/streak" className="btn">Рейтинг класса <ArrowRight size={15} /></Link>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onStart}>Потренироваться ещё</button>
            </>
          ) : (
            <>
              <button className="btn btn-primary btn-lg ss-go" onClick={onStart}>
                <Play size={16} /> {atRisk ? "Сохранить серию" : current ? "Пройти квиз дня" : "Зажечь огонёк"}
              </button>
              <small>{dailySize} вопросов · ≈ 2 мин · до +{10 + dailySize * 2} XP</small>
            </>
          )}
        </div>
      </div>

      <div className="ss-bottom">
        <div className="ss-week" aria-label="Последние 7 дней">
          {week.map((d) => (
            <span key={d.date} className={`ss-dot ${d.status}`} title={`${weekdayShort(d.date)}, ${d.date}`}>
              <i aria-hidden>{d.status === "done" ? <Check size={11} strokeWidth={3} /> : d.status === "frozen" ? <Snowflake size={10} /> : null}</i>
              <span>{weekdayShort(d.date).slice(0, 2)}</span>
            </span>
          ))}
        </div>
        <div className="ss-facts">
          {classToday && classToday.total > 1 && (
            <span className="ss-fact">
              <Users size={14} aria-hidden />
              {classDone > 0
                ? <span><b className="num">{classDone} из {classToday.total}</b> в классе уже прошли сегодня</span>
                : <span>Станьте <b>первым в классе</b>, кто прошёл квиз сегодня</span>}
            </span>
          )}
          {rank && (
            <span className="ss-fact">
              <Trophy size={14} aria-hidden />
              {rank.ahead
                ? <span><b>{rank.place}-е место</b> по серии · {rank.ahead.name} впереди на {days(rank.ahead.streak - current)}</span>
                : <span><b>1-е место</b> в классе по серии — {todayDone ? "держите отрыв" : "не отдавайте его"}</span>}
            </span>
          )}
          {nextBadge && badgeLeft > 0 && (
            <span className="ss-fact ss-badge">
              <Award size={14} aria-hidden />
              <span>До значка «{nextBadge.title}» — {days(badgeLeft)}</span>
              <span className="ss-badge-bar" aria-hidden><i style={{ width: `${Math.min(100, (current / nextBadge.days) * 100)}%` }} /></span>
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
