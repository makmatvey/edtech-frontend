const TOKEN_KEY = "klasna.token";

export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* приватный режим — живём без запоминания */ }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };
/** Общая реакция на 401: если запрос шёл с токеном — сессия истекла, выходим (для api() и downloadFile()). */
export function handleUnauthorized(status: number, sentToken: string | null) {
  if (status === 401 && sentToken && onUnauthorized) onUnauthorized();
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "Нет связи с сервером. Проверьте подключение и попробуйте ещё раз");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    handleUnauthorized(res.status, token);
    throw new ApiError(res.status, data?.details?.[0] ?? data?.error ?? `Ошибка ${res.status}`);
  }
  return data as T;
}
