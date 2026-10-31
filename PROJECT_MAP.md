# Карта проекта (React + Vite + JS)

## Стек

- React (JavaScript, без TypeScript)
- Vite (сборщик)
- Tailwind CSS v4 (стили)
- React Router v6 (роутинг)

## Структура

- `src/main.jsx` — точка входа, оборачивает App в BrowserRouter.
- `src/App.jsx` — все маршруты (Routes).
- `src/components/Layout.jsx` — общая шапка для всех страниц (через <Outlet />).
- `src/pages/` — папка со страницами (DashboardPage, NotFoundPage).
- `src/api/client.js` — функция `apiFetch(path, options)`. Все запросы к бэку идут ТОЛЬКО через неё. Она сама подставляет baseURL и парсит ошибки.
- `src/index.css` — импорт Tailwind (`@import "tailwindcss";`).

## Правила работы с API

- Бэкенд возвращает ошибки в формате `{ code, message }`.
- `apiFetch` уже умеет доставать `message` и кидать `throw new Error(message)`.
- В компонентах мы ловим эту ошибку через `try/catch` в `useEffect`.

## Как добавить новую страницу

1. Создать файл в `src/pages/NamePage.jsx` (экспорт default).
2. Импортировать в `src/App.jsx` и добавить `<Route path="/name" element={<NamePage />} />` внутрь `<Route element={<Layout />}>`.
