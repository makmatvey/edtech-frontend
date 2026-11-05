import { Link } from "react-router-dom";
import Button from "./ui/Button";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
];

export default function LandingHeader() {
  return (
    <header className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <Link to="/" className="font-semibold text-lg text-gray-900 shrink-0">
          EdTech Hack
        </Link>

        <nav
          className="hidden sm:flex items-center gap-6 text-sm text-gray-600"
          aria-label="Primary"
        >
          {navLinks.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="hover:text-gray-900 transition-colors"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Button variant="ghost" href="#login">
            Log in
          </Button>
          <Button variant="secondary" to="/dashboard">
            Dashboard
          </Button>
        </div>
      </div>
    </header>
  );
}
