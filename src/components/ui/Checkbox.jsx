import { cn } from "./cn";

export default function Checkbox({ className, label, id, ...props }) {
  return (
    <label
      htmlFor={id}
      className={cn("inline-flex items-start gap-2.5 cursor-pointer select-none", className)}
    >
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 rounded border-border text-brand-600 focus:ring-brand-500/30"
        {...props}
      />
      {label && <span className="text-sm text-ink leading-snug">{label}</span>}
    </label>
  );
}
