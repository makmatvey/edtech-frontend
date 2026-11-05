import { cn } from "./cn";
import Badge from "./Badge";

export default function PageHeader({
  title,
  description,
  badge,
  actions,
  className,
}) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
          {badge}
        </div>
        {description && (
          <p className="max-w-2xl text-sm text-ink-muted leading-relaxed sm:text-base">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function HackathonBadge() {
  return <Badge variant="brand">EdTech · ЛБГУ</Badge>;
}
