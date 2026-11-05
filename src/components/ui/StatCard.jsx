import { cn } from "./cn";
import { Card, CardContent } from "./Card";

export default function StatCard({ label, value, hint, trend, icon, className }) {
  const trendUp = trend?.startsWith("+");

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="flex items-start justify-between gap-3 py-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">{value}</p>
          {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
          {trend && (
            <p
              className={cn(
                "mt-2 text-xs font-medium",
                trendUp ? "text-success-600" : "text-danger-600",
              )}
            >
              {trend} к прошлой неделе
            </p>
          )}
        </div>
        {icon && (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            {icon}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
