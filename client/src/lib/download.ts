import { ApiError, getToken, handleUnauthorized } from "./api";

/** Имя файла из Content-Disposition: сначала filename* (UTF-8), потом filename. */
function fileNameFrom(header: string | null, fallback: string) {
  if (!header) return fallback;
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  if (star) {
    try { return decodeURIComponent(star[1].trim().replace(/^"|"$/g, "")); } catch { /* битая кодировка — ниже */ }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/.exec(header);
  const name = plain?.[1]?.trim();
  return name && name !== "export.csv" ? name : fallback;
}

/**
 * Скачивание файла с API: эндпоинты требуют токен в заголовке,
 * поэтому обычная ссылка не подходит — берём Blob и «кликаем» по временной <a download>.
 */
export async function downloadFile(path: string, fallbackName: string): Promise<string> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new ApiError(0, "Нет связи с сервером. Проверьте подключение и попробуйте ещё раз");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    handleUnauthorized(res.status, token); // как в api(): истёкшая сессия — глобальный выход
    throw new ApiError(res.status, data?.details?.[0] ?? data?.error ?? `Ошибка ${res.status}`);
  }
  const blob = await res.blob();
  const name = fileNameFrom(res.headers.get("Content-Disposition"), fallbackName);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return name;
}
