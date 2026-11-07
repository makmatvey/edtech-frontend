import { Flame, Trophy, Zap } from "lucide-react";
import { useApi } from "../lib/hooks";
import { Load } from "./ui";
import { ACH, Medal, ProfileBg, UserAvatar } from "./ProfileBits";
import { days } from "../lib/format";

type Card = {
  id: number; name: string; className: string; me: boolean;
  avatar: string | null; frame: string | null; background: string | null; showcase: string[];
  streak: number; best: number; xp: number; achievements: { earned: number; total: number };
};

/** Карточка одноклассника — открывается по клику в рейтинге класса */
export function ClassmateCard({ id }: { id: number }) {
  const state = useApi<Card>(`/student/classmates/${id}`);
  return (
    <Load state={state}>
      {(c) => (
        <div className="mate">
          <ProfileBg id={c.background} className="mate-banner" />
          <div className="mate-body">
            <UserAvatar name={c.name} id={c.id} src={c.avatar} frame={c.frame} size={88} />
            <h2>{c.name}{c.me ? " (вы)" : ""}</h2>
            <p className="muted small">{c.className} класс</p>
            {c.showcase.length > 0 ? (
              <ul className="mate-show">
                {c.showcase.map((s) => (
                  <li key={s}><Medal id={s} size={40} /><span>{ACH[s]?.title}</span></li>
                ))}
              </ul>
            ) : <p className="tiny muted" style={{ marginTop: 12 }}>Витрина достижений пока пуста</p>}
            <div className="mate-stats">
              <span><Flame size={15} aria-hidden /> <b className="num">{c.streak}</b> серия</span>
              <span><Trophy size={15} aria-hidden /> <b className="num">{days(c.best)}</b> лучшая</span>
              <span><Zap size={15} aria-hidden /> <b className="num">{c.xp}</b> XP</span>
            </div>
            <p className="tiny muted" style={{ marginTop: 10 }}>Достижений: {c.achievements.earned} из {c.achievements.total}</p>
          </div>
        </div>
      )}
    </Load>
  );
}
