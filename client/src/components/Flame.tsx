import { useEffect, useId, useRef, useState } from "react";

/**
 * Огонёк стрика.
 *  lit=false — потухший (серый уголёк с дымком): сегодня задание ещё не выполнено;
 *  lit=true  — горит и мерцает;
 *  переход false → true проигрывает вспышку «зажигания».
 */
export function Flame({ lit, size = 48, label }: { lit: boolean; size?: number; label?: string }) {
  const id = useId().replace(/:/g, "");
  const prev = useRef(lit);
  const [igniting, setIgniting] = useState(false);
  useEffect(() => {
    if (lit && !prev.current) {
      setIgniting(true);
      const t = setTimeout(() => setIgniting(false), 1100);
      prev.current = lit;
      return () => clearTimeout(t);
    }
    prev.current = lit;
  }, [lit]);

  return (
    <span
      className={`flame ${lit ? "lit" : "out"} ${igniting ? "ignite" : ""}`}
      style={{ width: size, height: size }}
      // label="" — огонёк декоративный (подпись уже есть у родителя, например у ссылки со стриком)
      role={label === "" ? undefined : "img"}
      aria-hidden={label === "" ? true : undefined}
      aria-label={label === "" ? undefined : label ?? (lit ? "Огонёк горит: сегодня задание выполнено" : "Огонёк потух: пройдите квиз дня")}
    >
      <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
        <defs>
          <radialGradient id={`g-${id}`} cx="50%" cy="78%" r="70%">
            <stop offset="0%" stopColor="#FFE27A" />
            <stop offset="45%" stopColor="#FFA02E" />
            <stop offset="100%" stopColor="#F2542D" />
          </radialGradient>
          <radialGradient id={`c-${id}`} cx="50%" cy="80%" r="60%">
            <stop offset="0%" stopColor="#FFF6D1" />
            <stop offset="100%" stopColor="#FFC94A" />
          </radialGradient>
        </defs>
        {/* дымок для потухшего состояния */}
        <g className="smoke">
          <path d="M30 14c-3-4 2-6 0-10" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M37 18c-2-3 2-5 0-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </g>
        <g className="body">
          <path className="outer" fill={`url(#g-${id})`}
            d="M32 6c2 9 12 14 14 26 2 11-5 22-14 22S16 45 18 34c1-6 5-9 7-14 1 5 3 7 6 8-2-8-1-15 1-22z" />
          <path className="inner" fill={`url(#c-${id})`}
            d="M32 30c1 5 7 7 7 14 0 5-3 9-7 9s-7-4-7-9c0-4 2-6 4-8 0 3 1 4 3 5-1-4-1-7 0-11z" />
        </g>
        <ellipse className="ember" cx="32" cy="56" rx="11" ry="3" />
      </svg>
      {igniting && <span className="flame-burst" aria-hidden />}
    </span>
  );
}
