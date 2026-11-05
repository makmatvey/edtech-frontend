import { Link } from "react-router-dom";
import { cn } from "./ui/cn";
import Badge from "./ui/Badge";

const navLinks = [
  { label: "Features", href: "/#features" },
  { label: "How it works", href: "/#how-it-works" },
];

const linkButtonClass = cn(
  "inline-flex items-center justify-center rounded-[var(--radius-ui)] font-medium transition-colors",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-500",
  "h-10 px-4 text-sm gap-2",
  "bg-white text-ink border border-border hover:bg-surface-muted",
);

export default function LandingHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white shadow-sm">
            E
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold text-ink">EdTech Hack</span>
            <span className="block text-xs text-ink-muted">Schools &amp; vocational</span>
          </span>
        </Link>

        <nav
          className="hidden items-center gap-1 sm:flex"
          aria-label="Primary"
        >
          {navLinks.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="brand" className="hidden md:inline-flex">
            Hackathon 2026
          </Badge>
          <a
            href="/#login"
            className="inline-flex h-8 items-center rounded-[var(--radius-ui)] px-3 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            Log in
          </a>
          <Link to="/dashboard" className={linkButtonClass}>
            Dashboard
          </Link>
        </div>
      </div>
    </header>
  );
}
