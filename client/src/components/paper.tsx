import type { CSSProperties, ReactNode } from "react";

/**
 * Тетрадные поверхности для экранов учителя.
 * NbPage — лист в линейку с красной линией полей; номер строки «висит» на полях.
 * NbHead — заголовок как в тетради: жирно и подчёркнуто чернилами (2px).
 */
export function NbPage({ children, className = "", label, style, as = "section" }: {
  children: ReactNode; className?: string; label?: string; style?: CSSProperties; as?: "section" | "div";
}) {
  const Tag = as;
  return <Tag className={`nb-page ${className}`} aria-label={label} style={style}>{children}</Tag>;
}

export function NbHead({ title, hint, right, level = 2, id }: { title: ReactNode; hint?: ReactNode; right?: ReactNode; level?: 2 | 3; id?: string }) {
  const H = level === 2 ? "h2" : "h3";
  return (
    <header className="nb-head">
      <H id={id}>{title}</H>
      {hint && <span className="nb-hint">{hint}</span>}
      {right && <div className="nb-right">{right}</div>}
    </header>
  );
}

/** Переключатель в тетрадном виде: выбранный пункт подчёркнут синими чернилами. */
export function NbSeg({ children }: { children: ReactNode }) {
  return <div className="nb-seg">{children}</div>;
}
