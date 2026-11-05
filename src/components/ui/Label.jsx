import { cn } from "./cn";

export default function Label({ className, required, children, htmlFor, ...props }) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn("block text-sm font-medium text-ink", className)}
      {...props}
    >
      {children}
      {required && <span className="text-danger-600 ml-0.5">*</span>}
    </label>
  );
}
