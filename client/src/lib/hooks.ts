import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";

/** Загрузка данных с отменой, повтором и «тихим» обновлением без мигания. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const ctrl = useRef<AbortController | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!path) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const r = await api<T>(path, { signal: c.signal });
      if (!c.signal.aborted) setData(r);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e instanceof ApiError ? e.message : "Не удалось загрузить данные");
    } finally {
      if (!c.signal.aborted) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    load();
    return () => ctrl.current?.abort();
  }, [load]);

  return { data, error, loading, reload: () => load(true), setData };
}

export function useLocalState<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ }
  }, [key, v]);
  return [v, setV] as const;
}

export function useTitle(title: string) {
  useEffect(() => { document.title = title ? `${title} · Класна` : "Класна"; }, [title]);
}
