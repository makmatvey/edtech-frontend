import { cn } from "./cn";

const variants = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 focus-visible:ring-brand-500 shadow-sm",
  secondary:
    "bg-white text-ink border border-border hover:bg-surface-muted focus-visible:ring-brand-500",
  outline:
    "border border-brand-300 text-brand-700 bg-brand-50 hover:bg-brand-100 focus-visible:ring-brand-500",
  ghost: "text-ink-muted hover:bg-surface-muted hover:text-ink focus-visible:ring-brand-500",
  danger:
    "bg-danger-600 text-white hover:bg-danger-700 focus-visible:ring-danger-600 shadow-sm",
};

const sizes = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-base gap-2",
};

export default function Button({
  variant = "primary",
  size = "md",
  className,
  disabled,
  children,
  type = "button",
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center rounded-[var(--radius-ui)] font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
