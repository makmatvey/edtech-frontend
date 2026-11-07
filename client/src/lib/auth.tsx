import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError, api, getToken, setToken, setUnauthorizedHandler } from "./api";
import { resetStreak } from "./streak";

export type Role = "student" | "teacher";
export type Profile = {
  id: number; login: string; role: Role; fullName: string; shortName: string;
  className: string | null; classId: number | null; grade: number | null; school: string; today: string; joinCode: string | null;
  /** Профиль: фото (data URL), рамка за отметки, значки на витрине */
  avatar?: string | null; frame?: string | null; showcase?: string[]; background?: string | null;
};

type Ctx = {
  user: Profile | null;
  ready: boolean;
  login: (login: string, password: string, role: Role) => Promise<Profile>;
  logout: () => void;
  register: (body: Record<string, unknown>) => Promise<Profile>;
  /** Обновить профиль в шапке без перезагрузки (фото, рамка, витрина) */
  patchUser: (p: Partial<Profile>) => void;
  /** Есть сохранённый вход, но проверить его не удалось (нет сети / сервер не ответил) — ждём связь */
  resuming: boolean;
  /** Повторить проверку сохранённого входа прямо сейчас */
  retryResume: () => void;
};

/** Новый пароль: от 8 символов, хотя бы одна буква и одна цифра (то же правило проверяет сервер) */
export const PASSWORD_HINT = "Не короче 8 символов, хотя бы одна буква и одна цифра";
export function passwordProblem(p: string): string | null {
  if (p.length < 8) return "Пароль — минимум 8 символов";
  if (!/\p{L}/u.test(p)) return "Добавьте в пароль хотя бы одну букву";
  if (!/\d/.test(p)) return "Добавьте в пароль хотя бы одну цифру";
  return null;
}

/** Как часто перепроверять сохранённый вход, пока нет связи (плюс сразу по событию online) */
const RESUME_RETRY_MS = 15_000;
const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const [resuming, setResuming] = useState(false);
  const retryRef = useRef<() => void>(() => {});

  const logout = useCallback(() => {
    setToken(null);
    resetStreak();
    setResuming(false);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!getToken()) { setReady(true); return; }
    let stopped = false, busy = false, done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => { done = true; setResuming(false); clearTimeout(timer); };
    const check = async () => {
      if (stopped || done || busy) return;
      if (!getToken()) { finish(); return; } // вышли или вошли под другим аккаунтом вручную
      busy = true;
      clearTimeout(timer);
      try {
        const u = await api<Profile>("/auth/me");
        if (!stopped) { setUser((cur) => cur ?? u); finish(); }
      } catch (e) {
        if (stopped) return;
        // Токен сбрасываем, только если сервер его отверг. Без сети (PWA офлайн) или при сбое сервера
        // сессию не теряем: проверяем снова по событию online и раз в 15 с — вход откроется сам.
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) { setToken(null); finish(); }
        else { setResuming(true); timer = setTimeout(check, RESUME_RETRY_MS); }
      } finally {
        busy = false;
        if (!stopped) setReady(true);
      }
    };
    retryRef.current = () => { void check(); };
    const onOnline = () => { void check(); };
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    void check();
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [logout]);

  const retryResume = useCallback(() => retryRef.current(), []);

  const login = useCallback(async (loginName: string, password: string, role: Role) => {
    const r = await api<{ token: string; user: Profile }>("/auth/login", { method: "POST", body: { login: loginName, password, role } });
    setToken(r.token);
    resetStreak();
    setResuming(false);
    setUser(r.user);
    return r.user;
  }, []);

  const register = useCallback(async (body: Record<string, unknown>) => {
    const r = await api<{ token: string; user: Profile }>("/auth/register", { method: "POST", body });
    setToken(r.token);
    setResuming(false);
    setUser(r.user);
    return r.user;
  }, []);

  const patchUser = useCallback((p: Partial<Profile>) => setUser((u) => (u ? { ...u, ...p } : u)), []);
  const value = useMemo(() => ({ user, ready, login, logout, register, patchUser, resuming, retryResume }), [user, ready, login, logout, register, patchUser, resuming, retryResume]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("useAuth вне AuthProvider");
  return c;
}
