import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

/** Ловит любую ошибку рендера: вместо белого экрана — понятное сообщение и кнопка «Обновить». */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error("UI error:", error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid-paper" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
        <div className="panel panel-pad" style={{ maxWidth: 460, textAlign: "center", display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
          <AlertTriangle size={32} color="var(--amber)" />
          <h1 style={{ fontSize: 22 }}>Страница не загрузилась</h1>
          <p className="ink-2">Произошла ошибка в интерфейсе. Данные не потеряны — обновите страницу, чтобы продолжить.</p>
          <button className="btn btn-primary" onClick={() => location.reload()}><RotateCw size={16} /> Обновить страницу</button>
        </div>
      </div>
    );
  }
}
