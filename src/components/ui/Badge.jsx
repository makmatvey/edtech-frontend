import { cn } from "./cn";

const variants = {
  default: "bg-surface-muted text-ink border-border",
  brand: "bg-brand-50 text-brand-800 border-brand-200",
  success: "bg-success-50 text-success-700 border-emerald-200",
  warning: "bg-warning-50 text-warning-600 border-amber-200",
  danger: "bg-danger-50 text-danger-700 border-red-200",
  accent: "bg-accent-50 text-accent-600 border-amber-200",
};

export default function Badge({ variant = "default", className, children }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Бейдж уровня образования: СОШ или СПО */
export function EducationTrackBadge({ track = "sosh", className }) {
  const isSosh = track === "sosh";
  return (
    <Badge
      variant={isSosh ? "brand" : "accent"}
      className={cn("uppercase tracking-wide", className)}
    >
      {isSosh ? "СОШ" : "СПО"}
    </Badge>
  );
}
