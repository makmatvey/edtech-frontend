import { cn } from "./cn";

export default function Spinner({ className, label = "Загрузка..." }) {
  return (
    <div className={cn("inline-flex items-center gap-2 text-sm text-ink-muted", className)}>
      <span
        className="size-4 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600"
        aria-hidden
      />
      <span>{label}</span>
    </div>
  );
}

export function LoadingBlock({ label = "Загрузка..." }) {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-[var(--radius-card)] border border-dashed border-border bg-white/60">
      <Spinner label={label} />
    </div>
  );
}
