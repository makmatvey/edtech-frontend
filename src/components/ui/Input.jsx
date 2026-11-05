import { cn } from "./cn";

const fieldClass =
  "w-full h-10 rounded-[var(--radius-ui)] border border-border bg-white px-3 text-sm text-ink placeholder:text-ink-muted/70 transition-colors focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/25 disabled:cursor-not-allowed disabled:opacity-60";

export default function Input({ className, error, id, ...props }) {
  return (
    <input
      id={id}
      className={cn(
        fieldClass,
        error && "border-danger-600 focus:border-danger-600 focus:ring-danger-600/20",
        className,
      )}
      aria-invalid={error ? true : undefined}
      {...props}
    />
  );
}

export function Textarea({ className, error, id, rows = 4, ...props }) {
  return (
    <textarea
      id={id}
      rows={rows}
      className={cn(
        fieldClass,
        "h-auto min-h-[5rem] py-2.5 resize-y",
        error && "border-danger-600 focus:border-danger-600 focus:ring-danger-600/20",
        className,
      )}
      aria-invalid={error ? true : undefined}
      {...props}
    />
  );
}

export function Select({ className, error, id, children, ...props }) {
  return (
    <select
      id={id}
      className={cn(
        fieldClass,
        "pr-8",
        error && "border-danger-600 focus:border-danger-600 focus:ring-danger-600/20",
        className,
      )}
      aria-invalid={error ? true : undefined}
      {...props}
    >
      {children}
    </select>
  );
}

export function FieldHint({ className, error, children }) {
  if (!children) return null;
  return (
    <p
      className={cn(
        "mt-1.5 text-xs",
        error ? "text-danger-600" : "text-ink-muted",
        className,
      )}
    >
      {children}
    </p>
  );
}
