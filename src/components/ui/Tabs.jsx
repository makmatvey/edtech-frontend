import { cn } from "./cn";

export function Tabs({ value, onChange, items, className }) {
  return (
    <div
      className={cn("inline-flex flex-wrap gap-1 rounded-[var(--radius-ui)] bg-surface-muted p-1", className)}
      role="tablist"
    >
      {items.map((item) => {
        const active = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-white text-ink shadow-sm"
                : "text-ink-muted hover:text-ink",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
