import type { CSSProperties, ReactNode } from "react";
import {
  Brain, CalendarCheck, Crosshair, Crown as CrownIc, Dumbbell, FileCheck2, Flame, Gem, GraduationCap, ListChecks, PenLine, Puzzle, Rocket, ShieldCheck,
  Sparkles, Star, Target, TrendingUp, Trophy, Zap,
} from "lucide-react";
import { avatarColor, initials } from "../lib/format";

type Tier = "bronze" | "silver" | "gold" | "legend";
const G = (a: string, b: string) => `linear-gradient(135deg, ${a}, ${b})`;
const FIRE = G("#ffb347", "#ff4e50");
/** Внешний вид достижений (условия и прогресс — на сервере): своя яркая плитка, редкость — цветом обводки */
export const ACH: Record<string, { title: string; tier: Tier; bg: string; num?: number; icon?: (s: number) => ReactNode }> = {
  quiz1: { title: "Первый шаг", tier: "bronze", bg: G("#a18cff", "#6a4bd8"), icon: (s) => <Sparkles size={s} /> },
  streak3: { title: "Разгон", tier: "bronze", bg: FIRE, num: 3 },
  perfect1: { title: "Чистая работа", tier: "bronze", bg: G("#ff9a8b", "#ff3d68"), icon: (s) => <Target size={s} /> },
  streak14: { title: "Две недели", tier: "silver", bg: FIRE, num: 14 },
  streak30: { title: "Месяц без пропусков", tier: "gold", bg: G("#ff6a00", "#ee0979"), num: 30 },
  streak60: { title: "Железная воля", tier: "legend", bg: G("#ee0979", "#8e2de2"), num: 60 },
  streak100: { title: "Сотня", tier: "legend", bg: G("#8e2de2", "#2140c4"), num: 100 },
  perfect5: { title: "Безупречная пятёрка", tier: "gold", bg: G("#ff5e62", "#c3002f"), icon: (s) => <Crosshair size={s} /> },
  quiz100: { title: "Эрудит", tier: "gold", bg: G("#4facfe", "#2140c4"), icon: (s) => <Brain size={s} /> },
  hattrick: { title: "Хет-трик", tier: "legend", bg: G("#ff2e63", "#7a0bc0"), icon: (s) => <Flame size={s} /> },
  tensweek: { title: "Неделя десяток", tier: "gold", bg: G("#ff416c", "#d8262f"), icon: (s) => <PenLine size={s} /> },
  tens25: { title: "Коллекционер", tier: "gold", bg: G("#f953c6", "#b91d73"), icon: (s) => <Gem size={s} /> },
  comeback: { title: "Камбэк", tier: "silver", bg: G("#00c9ff", "#3a47d5"), icon: (s) => <TrendingUp size={s} /> },
  nolow: { title: "Без слабых мест", tier: "gold", bg: G("#5ee7df", "#2b6cb0"), icon: (s) => <ShieldCheck size={s} /> },
  allround: { title: "Мастер на все руки", tier: "gold", bg: G("#fdbb2d", "#e8590c"), icon: (s) => <Puzzle size={s} /> },
  prof: { title: "Профессор", tier: "legend", bg: G("#30cfd0", "#330867"), icon: (s) => <GraduationCap size={s} /> },
  tasks100: { title: "Трудяга", tier: "gold", bg: G("#00c6ff", "#0052d4"), icon: (s) => <Dumbbell size={s} /> },
  checks20: { title: "Самоконтроль", tier: "silver", bg: G("#7f7fd5", "#5b6ee1"), icon: (s) => <ListChecks size={s} /> },
  xp3000: { title: "Звёздный ученик", tier: "gold", bg: G("#ffd200", "#f7971e"), icon: (s) => <Star size={s} /> },
  leader: { title: "Лидер класса", tier: "silver", bg: G("#f7b733", "#fc4a1a"), icon: (s) => <CrownIc size={s} /> },
  attend: { title: "Всегда на месте", tier: "silver", bg: G("#43cbff", "#5b86e5"), icon: (s) => <CalendarCheck size={s} /> },
  exam1: { title: "Первый вариант", tier: "silver", bg: G("#8e2de2", "#4a00e0"), icon: (s) => <FileCheck2 size={s} /> },
  exam90: { title: "Почти сотня", tier: "gold", bg: G("#ff6cab", "#7366ff"), icon: (s) => <Rocket size={s} /> },
  exam8: { title: "Готов к экзамену", tier: "legend", bg: G("#f2994a", "#eb5757"), icon: (s) => <Trophy size={s} /> },
};

/** Значок достижения: цветная плитка с иконкой (у серии — число дней), обводка — редкость */
export function Medal({ id, size = 20, locked = false }: { id: string; size?: number; locked?: boolean }) {
  const a = ACH[id];
  if (!a) return null;
  return (
    <span className={`medal t-${a.tier} ${locked ? "locked" : ""}`}
      style={{ width: size, height: size, background: a.bg, fontSize: size * (a.num && a.num >= 100 ? 0.36 : 0.46) } as CSSProperties}
      title={a.title} role="img" aria-label={`Достижение «${a.title}»`}>
      {a.num ?? a.icon?.(Math.round(size * 0.54))}
    </span>
  );
}

export function Showcase({ ids, size = 18 }: { ids: string[]; size?: number }) {
  if (!ids.length) return null;
  return <span className="showcase">{ids.map((id) => <Medal key={id} id={id} size={size} />)}</span>;
}

/** Лавровые ветви вокруг аватара */
function Laurel() {
  const leaf = (x: number, y: number, r: number, k: number) => <ellipse key={k} cx={x} cy={y} rx="3.4" ry="7" transform={`rotate(${r} ${x} ${y})`} />;
  const left = [[18, 74, -35], [11, 62, -15], [8, 49, 0], [9, 36, 15], [14, 24, 35]];
  return (
    <svg className="frame-laurel" viewBox="0 0 100 100" aria-hidden>
      <g fill="url(#lg)">
        <defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe08a" /><stop offset="1" stopColor="#b9800f" /></linearGradient></defs>
        {left.map(([x, y, r], i) => leaf(x, y, r, i))}
        {left.map(([x, y, r], i) => leaf(100 - x, y, -r, i + 10))}
      </g>
    </svg>
  );
}

function Crown() {
  return (
    <svg className="frame-crown" viewBox="0 0 40 24" aria-hidden>
      <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe9a3" /><stop offset="1" stopColor="#d39b1b" /></linearGradient></defs>
      <path d="M3 21 L1 6 L11 13 L20 2 L29 13 L39 6 L37 21 Z" fill="url(#cg)" stroke="#9a6a05" strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx="20" cy="14" r="2.4" fill="#e0302a" /><circle cx="10" cy="16" r="1.6" fill="#2f5bff" /><circle cx="30" cy="16" r="1.6" fill="#2f5bff" />
    </svg>
  );
}

/** Аватар: фото или инициалы; рамка — оформление за хорошие отметки */
export function UserAvatar({ name, id, src, frame, size = 36 }: { name: string; id: number; src?: string | null; frame?: string | null; size?: number }) {
  const inner = src
    ? <img className="avatar avatar-img" src={src} alt="" style={{ width: size, height: size }} />
    : <span className="avatar" style={{ width: size, height: size, background: avatarColor(id), fontSize: size * 0.36 }} aria-hidden>{initials(name)}</span>;
  if (!frame) return inner;
  return (
    <span className={`avatar-frame f-${frame}`} style={{ "--s": `${size}px` } as CSSProperties}>
      {inner}
      {frame === "ten" && <i className="frame-tag" aria-hidden>10</i>}
      {frame === "star" && <i className="frame-star" aria-hidden>★</i>}
      {frame === "laurel" && <Laurel />}
      {frame === "crown" && <Crown />}
      {frame === "sakura" && <><i className="frame-petal p1" aria-hidden /><i className="frame-petal p2" aria-hidden /><i className="frame-petal p3" aria-hidden /></>}
      {(frame === "ruby" || frame === "diamond") && <i className="frame-gem" aria-hidden />}
      {frame === "flame" && <i className="frame-fire" aria-hidden><Flame size={Math.max(10, Math.round(size * 0.28))} /></i>}
      {frame === "electro" && <i className="frame-bolt" aria-hidden><Zap size={Math.max(10, Math.round(size * 0.28))} /></i>}
    </span>
  );
}

/** Фон профиля (баннер над карточкой) */
export function ProfileBg({ id, className = "", children }: { id?: string | null; className?: string; children?: ReactNode }) {
  return <div className={`pbg pbg-${id || "grid"} ${className}`}>{children}</div>;
}
