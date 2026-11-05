import { cn } from "./cn";

const styles = {
  info: {
    wrap: "border-brand-200 bg-brand-50 text-brand-900",
    title: "text-brand-800",
  },
  success: {
    wrap: "border-emerald-200 bg-success-50 text-emerald-950",
    title: "text-success-700",
  },
  warning: {
    wrap: "border-amber-200 bg-warning-50 text-amber-950",
    title: "text-warning-600",
  },
  error: {
    wrap: "border-red-200 bg-danger-50 text-red-950",
    title: "text-danger-700",
  },
};

export default function Alert({ variant = "info", title, children, className }) {
  const tone = styles[variant] ?? styles.info;

  return (
    <div
      role="alert"
      className={cn("rounded-[var(--radius-ui)] border px-4 py-3 text-sm", tone.wrap, className)}
    >
      {title && <p className={cn("font-semibold mb-1", tone.title)}>{title}</p>}
      <div className="leading-relaxed opacity-95">{children}</div>
    </div>
  );
}
