# Класна — проект для хакатона в сфере E

![React](https://img.shields.io/badge/React-18-blue?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-purple?logo=vite)
![React Router](https://img.shields.io/badge/React_Router-6-CA4245?logo=reactrouter&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)

Фронтенд единой школьной платформы **«Класна — школа в одном окне»** для хакатона в сфере EdTech: кабинеты учителя и ученика, журнал, расписание, материалы, квиз дня и стрик.

Репозиторий — npm workspaces: интерфейс в `client/`, API и база в `server/` (в разработке Vite проксирует `/api` и `/materials`).

## 🛠 Технологический стек

- **Core:** React 18, TypeScript
- **Сборка:** Vite 5
- **Стилизация:** собственная дизайн-система в CSS (`client/src/styles/`), шрифты `@fontsource` (Golos Text, Caveat)
- **Маршрутизация:** React Router v6 (ленивые страницы, guard по роли)
- **UI:** lucide-react, модалки и тосты, командная палитра (Ctrl+K)
- **Сеть:** `fetch` + JWT в `localStorage` (`lib/api.ts`, `lib/auth.tsx`)
- **Инфраструктура:** Docker (production-образ), в prod статика отдаётся Express

## 📂 Структура проекта (client)

```text
client/src/
├── lib/              # API, сессия, хуки, форматирование, тема, материалы
├── components/       # Layout, UI, Quiz, TaskPlayer, Viewer, стрик, профиль
├── pages/            # Login, Register, Profile, Library, teacher/*, student/*
├── styles/           # app.css, materials.css, tasks.css
├── App.tsx           # Маршруты /t/* и /s/*, Guard, SeniorOnly
└── main.tsx          # Точка входа, провайдеры
```

Кратко о бэкенде в том же репозитории:

```text
server/src/
├── routes/           # auth, teacher, student, profile
├── services/         # квизы, уроки, стрик, материалы, задания
├── data/             # программы, вопросы, учебники (демо-контент)
└── index.ts          # Express + SQLite (node:sqlite)
```

## 🎯 Основные экраны

| Роль | Разделы |
|------|---------|
| **Учитель** | Сегодня, расписание и КТП, журнал урока, посещаемость и успеваемость, материалы, конструктор заданий |
| **Ученик** | Главная и стрик, оценки, дневник, ДЗ с самопроверкой, квиз дня, ЦТ/ЦЭ (10–11 класс), профиль |

## Инструкция по запуску

### Требования

- **Node.js ≥ 22.13** (нужен встроенный `node:sqlite` на сервере, нативных модулей нет)

### Разработка

```bash
npm install
npm run dev
```

- API: `http://localhost:3001`
- Интерфейс: `http://localhost:5173`

На Windows можно запустить двойным кликом по файлу **«Запустить Класну.bat»** в корне проекта.

### Демо-входы

Пароль для всех: **`demo`**

| Логин | Кто это |
|-------|---------|
| `teacher` | Учитель математики, классный руководитель 7Б |
| `student` | Ученица 7Б |
| `student11` | Ученик 11А (доступна подготовка к ЦТ/ЦЭ) |

### Полезные команды

| Команда | Назначение |
|---------|------------|
| `npm run seed` | Сбросить базу и заново заполнить демо-данными (сервер остановить) |
| `npm run db` | Создать или проверить базу без запуска сервера |
| `npm test` | Тесты API на временной базе |
| `npm run build` | Сборка `client/dist` и `server/dist` |
| `npm start` | Production: один процесс на `http://localhost:3001` |

База по умолчанию: `data/klasna.db` (не в git). При первом запуске создаётся и заполняется демо-школой.

Зафиксировать «сегодня» для показа (PowerShell):

```powershell
$env:KLASNA_TODAY="2026-11-05"; $env:KLASNA_NOW="10:40"; npm run dev
```

Подробнее: [docs/DEPLOY.md](docs/DEPLOY.md), [docs/SECURITY.md](docs/SECURITY.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
