import { cn } from "./cn";

export default function Skeleton({ className }) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-slate-200/80", className)}
      aria-hidden
    />
  );
}
