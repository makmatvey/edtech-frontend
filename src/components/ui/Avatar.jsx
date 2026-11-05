import { cn } from "./cn";

function initialsFromName(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const sizes = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-12 text-base",
};

export default function Avatar({ name, src, size = "md", className }) {
  if (src) {
    return (
      <img
        src={src}
        alt={name || ""}
        className={cn("rounded-full object-cover ring-2 ring-white", sizes[size], className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-800 ring-2 ring-white",
        sizes[size],
        className,
      )}
      aria-hidden={!name}
      title={name}
    >
      {initialsFromName(name)}
    </div>
  );
}
