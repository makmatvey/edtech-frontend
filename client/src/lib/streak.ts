import { useEffect, useState } from "react";
import { api } from "./api";

/** Общее «живое» состояние стрика ученика: квиз обновляет его сразу, все виджеты перерисовываются. */
export type StreakBrief = { current: number; todayDone: boolean; atRisk: boolean };
let state: StreakBrief | null = null;
let version = 0;
const subs = new Set<(s: StreakBrief | null) => void>();

export function setStreak(s: StreakBrief | null) {
  state = s ? { current: s.current, todayDone: s.todayDone, atRisk: s.atRisk } : null;
  version++;
  subs.forEach((f) => f(state));
}
export function resetStreak() { setStreak(null); }

let loading: Promise<void> | null = null;
export function refreshStreak() {
  if (loading) return loading;
  loading = api<StreakBrief>("/student/streak")
    .then((s) => setStreak(s))
    .catch(() => {})
    .finally(() => { loading = null; });
  return loading;
}

export function useStreak(autoload = true) {
  const [s, setS] = useState<StreakBrief | null>(state);
  useEffect(() => {
    subs.add(setS);
    if (autoload && !state) refreshStreak();
    return () => { subs.delete(setS); };
  }, [autoload]);
  return s;
}
export const streakVersion = () => version;
