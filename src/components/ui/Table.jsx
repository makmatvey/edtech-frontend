import { cn } from "./cn";

export function Table({ className, children }) {
  return (
    <div className="w-full overflow-x-auto rounded-[var(--radius-ui)] border border-border">
      <table className={cn("w-full min-w-[32rem] border-collapse text-sm", className)}>
        {children}
      </table>
    </div>
  );
}

export function TableHead({ children }) {
  return <thead className="bg-surface-muted/80 text-left">{children}</thead>;
}

export function TableBody({ children }) {
  return <tbody className="divide-y divide-border bg-white">{children}</tbody>;
}

export function TableRow({ className, children }) {
  return <tr className={cn("hover:bg-surface-muted/50 transition-colors", className)}>{children}</tr>;
}

export function TableHeaderCell({ className, children }) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-muted",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function TableCell({ className, children }) {
  return <td className={cn("px-4 py-3 text-ink align-middle", className)}>{children}</td>;
}
