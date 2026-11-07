import { useEffect, useRef, useState, type ReactNode } from "react";
import { fmtDayShort } from "../lib/format";

/** Ширина контейнера — чтобы рисовать SVG в реальных пикселях (подписи не растягиваются). */
function useWidth(initial = 640) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Линия по неделям (средний балл или % посещаемости). Без библиотек — чистый SVG. */
export function LineChart({
  points, min, max, format, height = 180, color = "var(--blue)", label,
}: {
  points: { x: string; y: number | null }[];
  min: number; max: number; format: (v: number) => string; height?: number; color?: string; label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useWidth();
  const H = height, padL = 36, padR = 12, padT = 12, padB = 26;
  const pts = points.filter((p) => p.y != null) as { x: string; y: number }[];
  if (pts.length < 2) return <div ref={ref} className="muted small" style={{ padding: 20 }}>Недостаточно данных для графика — нужны хотя бы две недели.</div>;
  const sx = (i: number) => padL + (i * (W - padL - padR)) / (pts.length - 1);
  const sy = (v: number) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${sx(i).toFixed(1)},${sy(p.y).toFixed(1)}`).join(" ");
  const area = `${path} L${sx(pts.length - 1)},${H - padB} L${sx(0)},${H - padB} Z`;
  const ticks = [min, (min + max) / 2, max];
  const h = hover != null ? pts[hover] : null;
  const every = Math.max(1, Math.ceil(pts.length / Math.max(2, Math.floor(W / 70))));
  return (
    <div ref={ref}>
    <svg className="chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}
      onMouseLeave={() => setHover(null)}
      onMouseMove={(e) => {
        const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * W;
        const i = Math.round(((x - padL) / (W - padL - padR)) * (pts.length - 1));
        setHover(Math.max(0, Math.min(pts.length - 1, i)));
      }}>
      {ticks.map((t) => (
        <g key={t}>
          <line className="axis" x1={padL} x2={W - padR} y1={sy(t)} y2={sy(t)} strokeDasharray="3 4" />
          <text x={padL - 8} y={sy(t) + 4} textAnchor="end">{format(t)}</text>
        </g>
      ))}
      <path d={area} fill={color} opacity={0.08} />
      <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <g key={p.x}>
          <circle cx={sx(i)} cy={sy(p.y)} r={hover === i ? 5 : 3} fill="var(--sheet)" stroke={color} strokeWidth={2} />
          {(i === pts.length - 1 || i % every === 0) && (
            <text x={sx(i)} y={H - 6} textAnchor="middle">{fmtDayShort(p.x)}</text>
          )}
        </g>
      ))}
      {h && hover != null && (
        <g>
          <line x1={sx(hover)} x2={sx(hover)} y1={padT} y2={H - padB} stroke={color} opacity={0.25} />
          <rect x={Math.min(sx(hover) + 8, W - 132)} y={sy(h.y) - 34} width={124} height={28} rx={8} fill="var(--ink)" />
          <text x={Math.min(sx(hover) + 8, W - 132) + 10} y={sy(h.y) - 15} style={{ fill: "var(--paper)", fontSize: 12, fontWeight: 600 }}>
            {`нед. ${fmtDayShort(h.x)}: ${format(h.y)}`}
          </text>
        </g>
      )}
    </svg>
    </div>
  );
}

/** Распределение оценок 1–10: красная ручка = 1–3, жёлтый = 4–5 */
export function GradeBars({ data }: { data: { value: number; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const [ref, W] = useWidth();
  const H = 170, padB = 24, padT = 18, gap = 10;
  const bw = (W - gap * 9) / 10;
  const color = (v: number) => (v <= 3 ? "var(--red)" : v <= 5 ? "var(--amber)" : v >= 9 ? "var(--green)" : "var(--blue)");
  return (
    <div ref={ref}>
    <svg className="chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Распределение оценок от 1 до 10">
      {data.map((d, i) => {
        const h = ((H - padB - padT) * d.count) / max;
        const x = i * (bw + gap);
        return (
          <g key={d.value}>
            <rect x={x} y={H - padB - h} width={bw} height={Math.max(h, 2)} rx={6} fill={color(d.value)} opacity={0.85} />
            {d.count > 0 && <text x={x + bw / 2} y={H - padB - h - 5} textAnchor="middle">{d.count}</text>}
            <text x={x + bw / 2} y={H - 6} textAnchor="middle" style={{ fontWeight: 600, fill: "var(--ink-2)" }}>{d.value}</text>
          </g>
        );
      })}
    </svg>
    </div>
  );
}

export function BarRow({ label, value, max, color, display }: { label: ReactNode; value: number | null; max: number; color?: string; display: string }) {
  return (
    <div className="bar-row">
      <span className="ellipsis">{label}</span>
      <div className="bar-track"><div className="bar-fill" style={{ width: `${value == null ? 0 : (value / max) * 100}%`, ["--c" as any]: color }} /></div>
      <span className="num strong" style={{ textAlign: "right" }}>{display}</span>
    </div>
  );
}

/** Цвет ячейки теплокарты по доле верных ответов: красный → янтарный → зелёный */
function heatTone(accuracy: number): "bad" | "warn" | "ok" | "good" {
  if (accuracy < 50) return "bad";
  if (accuracy < 60) return "warn";
  if (accuracy < 75) return "ok";
  return "good";
}

/** Тепловая карта слабых тем: ячейка = раздел, цвет = точность */
export function WeakHeatmap({
  items,
}: {
  items: { subject: string; section: string; accuracy: number; total: number; className: string }[];
}) {
  return (
    <div className="heat">
      <div className="heat-grid" role="list" aria-label="Тепловая карта тем по точности ответов">
        {items.map((w) => (
          <div
            key={`${w.subject}-${w.className}-${w.section}`}
            className={`heat-cell tone-${heatTone(w.accuracy)}`}
            role="listitem"
            title={`${w.section}: ${w.accuracy}% верных · ${w.total} ответов`}
          >
            <div className="heat-title small strong">{w.section}</div>
            <div className="heat-val">
              <span className="num strong">{w.accuracy}%</span>
            </div>
          </div>
        ))}
      </div>
      <div className="heat-legend" aria-hidden>
        <span className="heat-swatch tone-bad" />&lt;50%
        <span className="heat-swatch tone-warn" />50–59%
        <span className="heat-swatch tone-ok" />60–74%
        <span className="heat-swatch tone-good" />≥75%
      </div>
    </div>
  );
}

/** Мини-график последних оценок */
export function Sparkline({ values, width = 80, height = 24 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const sx = (i: number) => (i * (width - 4)) / (values.length - 1) + 2;
  const sy = (v: number) => height - 2 - ((v - 1) / 9) * (height - 4);
  const d = values.map((v, i) => `${i ? "L" : "M"}${sx(i)},${sy(v)}`).join(" ");
  const last = values[values.length - 1];
  return (
    <svg width={width} height={height} aria-hidden style={{ display: "block" }}>
      <path d={d} fill="none" stroke="var(--blue)" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={sx(values.length - 1)} cy={sy(last)} r={2.6} fill="var(--blue)" />
    </svg>
  );
}

/** Кольцо прогресса */
export function Ring({ value, max, size = 64, stroke = 7, color = "var(--blue)", children }: { value: number; max: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max ? Math.min(1, value / max) : 0;
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }}>
      <svg width={size} height={size} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontWeight: 700, fontSize: 14 }}>{children}</div>
    </div>
  );
}
