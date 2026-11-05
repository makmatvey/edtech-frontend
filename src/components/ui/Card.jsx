import { cn } from "./cn";

export function Card({ className, children, ...props }) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-card)]",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children }) {
  return (
    <div className={cn("border-b border-border px-5 py-4 sm:px-6", className)}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children }) {
  return (
    <h3 className={cn("text-base font-semibold text-ink tracking-tight", className)}>
      {children}
    </h3>
  );
}

export function CardDescription({ className, children }) {
  return (
    <p className={cn("mt-1 text-sm text-ink-muted leading-relaxed", className)}>
      {children}
    </p>
  );
}

export function CardContent({ className, children }) {
  return <div className={cn("px-5 py-4 sm:px-6", className)}>{children}</div>;
}

export function CardFooter({ className, children }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-t border-border px-5 py-4 sm:px-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
