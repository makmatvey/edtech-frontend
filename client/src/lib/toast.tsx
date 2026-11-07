import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";

type Toast = { id: number; text: string; err?: boolean };
const Ctx = createContext<(text: string, err?: boolean) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, err = false) => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x.slice(-2), { id, text, err }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), err ? 5000 : 2800);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toast-host" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.err ? "err" : ""}`}>
            {t.err ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
export const useToast = () => useContext(Ctx);
