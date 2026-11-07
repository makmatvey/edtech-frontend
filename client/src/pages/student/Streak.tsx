import { Showcase, UserAvatar } from "../../components/ProfileBits";
import { ClassmateCard } from "../../components/ClassmateCard";
import { useState } from "react";
import { Award, Flame, Lock, Medal, Trophy } from "lucide-react";
import { useApi, useTitle } from "../../lib/hooks";
import { Load, Modal, PageHead, Panel } from "../../components/ui";
import { StreakHero } from "../../components/StreakHero";
import { Quiz, StreakRules } from "../../components/Quiz";
import { fmtDayShort, parseDate } from "../../lib/format";

type StreakData = {
  current: number; best: number; todayDone: boolean; atRisk: boolean; freezeAvailable: boolean; xp: number; weekXp: number;
  calendar: { date: string; status: string }[];
  badges: { id: string; days: number; title: string; hint: string; earned: boolean }[];
  nextBadge: { title: string; days: number } | null;
  className: string;
  leaderboard: { id: number; name: string; streak: number; weekXp: number; me: boolean; place: number; avatar: string | null; frame: string | null; showcase: string[] }[];
  history: { date: string; mode: string; score: number; total: number; passed: number }[];
};

const STATUS_LABEL: Record<string, string> = { done: "выполнено", frozen: "заморозка", missed: "пропуск", off: "выходной", today: "сегодня", future: "" };

export default function StudentStreak() {
  useTitle("Квиз дня и стрик");
  const state = useApi<StreakData>("/student/streak");
  const [quiz, setQuiz] = useState(false);
  const [mate, setMate] = useState<number | null>(null);

  return (
    <>
      <PageHead title="Квиз дня и стрик" sub="Пять минут в день по темам, которые ваш класс уже прошёл на уроках." />
      <Load state={state}>
        {(d) => (
          <div className="stack" style={{ gap: 20 }}>
            <StreakHero current={d.current} todayDone={d.todayDone} atRisk={d.atRisk} week={d.calendar.slice(-7)} nextBadge={d.nextBadge} onStart={() => setQuiz(true)} />

            <div className="grid dash">
              <div className="stack">
                <Panel className="note" title="Календарь" hint="последние 5 недель" pad>
                  <div className="cal" role="group" aria-label="Календарь активности">
                    {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((w) => <div key={w} className="cal-h" aria-hidden>{w}</div>)}
                    {d.calendar.map((c) => {
                      const label = `${fmtDayShort(c.date)}${STATUS_LABEL[c.status] ? ` — ${STATUS_LABEL[c.status]}` : ""}`;
                      return (
                        <div key={c.date} className={`cal-d ${c.status}`} title={label}>
                          <span aria-hidden>{parseDate(c.date).getDate()}</span>
                          <span className="sr-only">{label}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="row wrap tiny muted" style={{ gap: 14, marginTop: 14 }}>
                    <span className="row"><i className="dot" style={{ background: "var(--blue)" }} /> день засчитан</span>
                    <span className="row"><i className="dot" style={{ background: "var(--blue-soft)", outline: "1px dashed var(--blue)" }} /> заморозка</span>
                    <span className="row"><i className="dot" style={{ background: "var(--red-soft)", outline: "1px solid var(--red)" }} /> пропуск</span>
                    <span className="row"><i className="dot" style={{ outline: "1px dashed var(--line-strong)" }} /> выходной / каникулы</span>
                  </div>
                </Panel>

                <div className="grid cols-3 streak-metrics">
                  <div className="panel metric"><div className="metric-label"><Trophy size={15} /> Лучшая серия</div><div className="metric-value">{d.best}</div><div className="metric-foot">дней подряд</div></div>
                  <div className="panel metric"><div className="metric-label"><Medal size={15} /> Опыт за неделю</div><div className="metric-value">{d.weekXp}</div><div className="metric-foot">всего {d.xp} XP</div></div>
                  <div className="panel metric"><div className="metric-label">❄ Заморозка</div><div className="metric-value" style={{ fontSize: 20, marginTop: 6 }}>{d.freezeAvailable ? "Доступна" : "Использована"}</div><div className="metric-foot">одна на неделю</div></div>
                </div>

                <Panel className="note" title="Значки" pad>
                  <div className="grid cols-2 badge-grid" style={{ gap: 10 }}>
                    {d.badges.map((b) => (
                      <div key={b.id} className={`badge-card ${b.earned ? "" : "locked"}`}>
                        <span className="badge-icon">{b.earned ? <Award size={22} /> : <Lock size={18} />}</span>
                        <div><div className="strong">{b.title}</div><div className="small muted">{b.hint}</div></div>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>

              <div className="stack">
                <Panel className="note" title={`Рейтинг ${d.className}`} hint="опыт за эту неделю">
                  <div className="list">
                    {d.leaderboard.slice(0, 10).map((r) => (
                      <button type="button" key={r.id} className="list-item board-row" onClick={() => setMate(r.id)} title="Открыть карточку" style={{ padding: "9px 20px", background: r.me ? "var(--blue-soft)" : undefined }}>
                        <span className="num strong" style={{ width: 22, color: r.place <= 3 ? "var(--blue)" : "var(--ink-3)" }}>{r.place}</span>
                        <UserAvatar name={r.name} id={r.id} src={r.avatar} frame={r.frame} size={28} />
                        <span className="grow small strong ellipsis row" style={{ gap: 6 }}><span className="ellipsis">{r.name}{r.me ? " (вы)" : ""}</span><Showcase ids={r.showcase} size={15} /></span>
                        <span className="row small" style={{ gap: 3, color: r.streak ? "var(--red)" : "var(--ink-3)" }}><Flame size={13} />{r.streak}</span>
                        <span className="num small" style={{ width: 56, textAlign: "right" }}>{r.weekXp} XP</span>
                      </button>
                    ))}
                    {!d.leaderboard.slice(0, 10).some((r) => r.me) && (() => {
                      const me = d.leaderboard.find((r) => r.me);
                      return me ? (
                        <div className="list-item" style={{ padding: "9px 20px", background: "var(--blue-soft)" }}>
                          <span className="num strong" style={{ width: 22 }}>{me.place}</span>
                          <UserAvatar name={me.name} id={me.id} src={me.avatar} frame={me.frame} size={28} />
                          <span className="grow small strong row" style={{ gap: 6 }}>{me.name} (вы)<Showcase ids={me.showcase} size={15} /></span>
                          <span className="num small">{me.weekXp} XP</span>
                        </div>
                      ) : null;
                    })()}
                  </div>
                </Panel>
                <Panel className="note" title="Как работает стрик" pad><StreakRules /></Panel>
              </div>
            </div>
            {d.history.length > 0 && (
              <Panel className="note" title="Последние попытки">
                <div className="list list-3">
                  {d.history.slice(0, d.history.length > 3 ? d.history.length - (d.history.length % 3) : 3).map((h, i) => (
                    <div key={i} className="list-item" style={{ padding: "9px 20px" }}>
                      <span className="small grow">{fmtDayShort(h.date)} · {h.mode === "daily" ? "Квиз дня" : "Самопроверка ДЗ"}</span>
                      <span className={`chip ${h.passed ? "chip-green" : "chip-red"}`}>{h.score} / {h.total}</span>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </div>
        )}
      </Load>
      {mate != null && (
        <Modal label="Карточка ученика" className="modal-card" onClose={() => setMate(null)}>
          <ClassmateCard id={mate} />
        </Modal>
      )}
      {quiz && (
        <Modal label="Квиз дня" onClose={() => { setQuiz(false); state.reload(); }}>
          <Quiz startPath="/student/quiz/daily" title="Квиз дня" onClose={() => { setQuiz(false); state.reload(); }} />
        </Modal>
      )}
    </>
  );
}
