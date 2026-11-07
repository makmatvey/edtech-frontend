import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/golos-text/400.css";
import "@fontsource/golos-text/500.css";
import "@fontsource/golos-text/600.css";
import "@fontsource/golos-text/700.css";
import "@fontsource/golos-text/800.css";
import "@fontsource/caveat/600.css";
import "@fontsource/caveat/700.css";
import "./styles/app.css";
import "./styles/materials.css";
import "./styles/tasks.css";
import { App } from "./App";
import { applyTheme, loadTheme } from "./lib/theme";

applyTheme(loadTheme());
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// PWA: service worker только в продакшн-сборке (в dev он мешал бы HMR и кэшировал бы исходники)
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* без service worker приложение работает как обычный сайт */
    });
  });
}
