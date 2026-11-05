import { cn } from "./cn";

export default function ProgressBar({ value = 0, label, className }) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-ink">{label}</span>
          <span className="tabular-nums text-ink-muted">{clamped}%</span>
        </div>
      )}
      <svg
        viewBox="0 0 100 4"
        className="h-2 w-full overflow-visible"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || "Прогресс"}
      >
        <rect width="100" height="4" rx="2" className="fill-slate-100" />
        <rect width={clamped} height="4" rx="2" className="fill-brand-600" />
      </svg>
    </div>
  );
}
