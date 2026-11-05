/** Склеивает className без внешних зависимостей */
export function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}
