import { useEffect, useRef, type ReactNode, type CSSProperties } from "react";
import { AlertTriangle, Inbox, RotateCw, X } from "lucide-react";
import { GRADE_KIND, avatarColor, initials } from "../lib/format";
import { useEscapeLayer } from "../lib/layers";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="row" style={{ gap: 10 }}>
      <img className="brand-mark" src="/icons/icon-192_new.png" width="34" height="34" alt="" aria-hidden="true" />
      {!compact && (
        <span className="brand-name">
          Класна
          <span className="brand-sub">школа в одном окне</span>
        </span>
      )}
    </span>
  );
}

/** Заставка на время проверки сохранённого входа — вместо белого экрана */
export function AppSplash() {
  return (
    <div className="app-splash" role="status" aria-live="polite">
      <div className="app-splash-in">
        <Brand />
        <span className="app-splash-bar" aria-hidden><i /></span>
        <span className="app-splash-text">Открываем кабинет…</span>
      </div>
    </div>
  );
}

export function Avatar({ name, id, size = 36 }: { name: string; id: number; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, background: avatarColor(id), fontSize: size * 0.36 }} aria-hidden>
      {initials(name)}
    </span>
  );
}

/** Оценка «красной ручкой». Контрольная — обведена, самостоятельная — подчёркнута. */
export function Mark({ value, kind, size, title }: { value: number; kind?: string; size?: "sm" | "lg" | "xl"; title?: string }) {
  const cls = ["mark", size ?? "", kind === "control" ? "control" : "", kind === "independent" ? "independent" : ""].join(" ");
  return (
    <span className={cls} title={title ?? (kind ? GRADE_KIND[kind] : undefined)} aria-label={`Оценка ${value}${kind ? `, ${GRADE_KIND[kind]?.toLowerCase()}` : ""}`}>
      {value}
    </span>
  );
}

export function SubjectTag({ name, color, className = "" }: { name: string; color: string; className?: string }) {
  return (
    <span className={`subject-tag ${className}`} style={{ "--c": color } as CSSProperties}>
      <span className="ellipsis">{name}</span>
    </span>
  );
}

export function PageHead({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function Panel({ title, hint, right, children, pad = false, className = "" }: { title?: ReactNode; hint?: ReactNode; right?: ReactNode; children: ReactNode; pad?: boolean; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-head">
          <h2 className="panel-title">{title}</h2>
          {hint && <span className="muted small">{hint}</span>}
          {right && <div className="right">{right}</div>}
        </div>
      )}
      {pad ? <div className="panel-pad">{children}</div> : children}
    </section>
  );
}

export function Metric({ label, value, foot, tone, icon }: { label: ReactNode; value: ReactNode; foot?: ReactNode; tone?: string; icon?: ReactNode }) {
  return (
    <div className="panel metric">
      <div className="metric-label">{icon}{label}</div>
      <div className={`metric-value ${tone ?? ""}`}>{value}</div>
      {foot && <div className="metric-foot">{foot}</div>}
    </div>
  );
}

export function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon ?? <Inbox size={28} />}
      <div className="strong">{title}</div>
      {children && <div className="small muted" style={{ maxWidth: 420 }}>{children}</div>}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <AlertTriangle size={18} />
      <span style={{ flex: 1 }}>{message}</span>
      {onRetry && (
        <button className="btn btn-sm" onClick={onRetry}>
          <RotateCw size={14} /> Повторить
        </button>
      )}
    </div>
  );
}

export function Skeleton({ h = 120, className = "" }: { h?: number; className?: string }) {
  return <div className={`skeleton ${className}`} style={{ height: h }} aria-hidden />;
}

export function PageSkeleton() {
  return (
    <div className="stack" aria-busy="true" aria-label="Загрузка">
      <Skeleton h={44} className="" />
      <div className="grid cols-4">
        <Skeleton h={96} /><Skeleton h={96} /><Skeleton h={96} /><Skeleton h={96} />
      </div>
      <Skeleton h={320} />
    </div>
  );
}

/** Обёртка загрузки: скелетон → ошибка с повтором → контент */
export function Load<T>({ state, children }: { state: { data: T | null; error: string | null; loading: boolean; reload: () => void }; children: (d: T) => ReactNode }) {
  if (state.error && !state.data) return <ErrorBox message={state.error} onRetry={state.reload} />;
  if (!state.data) return <PageSkeleton />;
  return <>{children(state.data)}</>;
}

export function Modal({ onClose, children, label, className = "" }: { onClose: () => void; children: ReactNode; label: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Esc закрывает только верхний слой: палитра или вложенное окно поверх модалки закроются первыми
  useEscapeLayer(true, onClose);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, []);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={ref}>
        <div className="row" style={{ justifyContent: "flex-end", marginBottom: -8 }}>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Progress({ value, max, color, label }: { value: number; max: number; color?: string; label?: string }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="progress" role="progressbar" aria-label={label ?? `${value} из ${max}`} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <i style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
