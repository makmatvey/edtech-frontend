export type Theme = "light" | "dark";

export function applyTheme(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
}

export function loadTheme(): Theme {
  try {
    const v = localStorage.getItem("klasna.theme");
    if (v === "dark" || v === "light") return v;
  } catch { /* ignore */ }
  return "light";
}

export function saveTheme(t: Theme) {
  try { localStorage.setItem("klasna.theme", t); } catch { /* ignore */ }
  applyTheme(t);
}
