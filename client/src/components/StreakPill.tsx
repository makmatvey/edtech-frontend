import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Flame } from "./Flame";
import { useStreak } from "../lib/streak";

/** Огонёк с числом дней в верхней панели ученика — виден на любой странице. */
export function StreakPill() {
  const s = useStreak();
  const [bump, setBump] = useState(false);
  const prev = useRef<number | null>(null);
  useEffect(() => {
    if (s && prev.current != null && s.current > prev.current) {
      setBump(true);
      const t = setTimeout(() => setBump(false), 700);
      return () => clearTimeout(t);
    }
    if (s) prev.current = s.current;
  }, [s]);
  useEffect(() => { if (s) prev.current = s.current; }, [s]);
  if (!s) return null;
  return (
    <Link to="/s/streak" className={`streak-pill ${s.todayDone ? "" : "out"} ${bump ? "bump" : ""}`}
      title={s.todayDone ? `Стрик ${s.current} — сегодня выполнено` : "Огонёк потух — пройдите квиз дня"}
      aria-label={`Стрик: ${s.current} дней подряд${s.todayDone ? ", сегодня выполнено" : ", сегодня ещё не выполнено"}`}>
      <Flame lit={s.todayDone} size={24} label="" />
      {s.current}
    </Link>
  );
}
