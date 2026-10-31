const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export async function apiFetch(path, options = {}) {
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
