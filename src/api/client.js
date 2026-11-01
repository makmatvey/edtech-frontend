import { mockFetch } from "./mock";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

export async function apiFetch(path, options = {}) {
  // ПРИ ИСПОЛЬЗОВАНИИ МОКА БУДЕМ БРАТЬ ЛОКАЛЬНЫЕ ДАННЫЕ, А НЕ ИЗ БЭКА
  if (USE_MOCK) {
    return mockFetch(path, options);
  }

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMessage = `Ошибка ${response.status}`;
    try {
      const data = await response.json();
      if (data.message) {
        errorMessage = data.message;
      }
    } catch {
      // если ответ не JSON, оставляем дефолтный текст
    }
    throw new Error(errorMessage);
  }

  if (response.status === 204) return null;
  return response.json();
}
