// ТЕСТОВЫЕ ДАННЫЕ, ПОКА БЭК НЕ РАБОТАЕТ
export const MOCK_ITEMS = [
  {
    id: 1,
    title: "Введение в React",
    description: "Базовый курс для начинающих",
  },
  {
    id: 2,
    title: "Продвинутый JavaScript",
    description: "Замыкания, прототипы и асинхронность",
  },
];

// ИМИТАЦИЯ ОТВЕТА СЕРВАКА
export function mockFetch(path) {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (path === "/items") {
        resolve(MOCK_ITEMS);
      } else {
        resolve({ status: "ok" });
      }
    }, 500);
  });
}
