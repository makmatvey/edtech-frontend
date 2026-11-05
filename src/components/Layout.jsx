import { NavLink, Outlet, Link } from "react-router-dom";
import { cn } from "./ui/cn";
import Badge from "./ui/Badge";

const navLinkClass = ({ isActive }) =>
  cn(
    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
    isActive ? "bg-brand-50 text-brand-800" : "text-ink-muted hover:bg-surface-muted hover:text-ink",
  );

export default function Layout() {
  return (
    <div className="min-h-screen bg-surface-muted">
      <header className="sticky top-0 z-20 border-b border-border bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white shadow-sm">
              Е
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold text-ink">EdTech Hack</span>
              <span className="block text-xs text-ink-muted">СОШ и СПО</span>
            </span>
          </Link>

          <nav className="flex flex-wrap items-center gap-1">
            <NavLink to="/dashboard" className={navLinkClass}>
              Дашборд
            </NavLink>
            <NavLink to="/ui-kit" className={navLinkClass}>
              UI-кит
            </NavLink>
          </nav>

          <Badge variant="brand" className="hidden sm:inline-flex">
            Хакатон 2026
          </Badge>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-border bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 text-center text-xs text-ink-muted">
          ИТ в образовании: улучшение и оптимизация процессов в СОШ и профтехе
        </div>
      </footer>
    </div>
  );
}
