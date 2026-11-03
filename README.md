# EdTech Hackaton Frontend

![React](https://img.shields.io/badge/React-18-blue?logo=react)
![Vite](https://img.shields.io/badge/Vite-5-purple?logo=vite)
![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?logo=tailwind-css)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat&logo=opensourceinitiative&logoColor=white)](https://opensource.org/licenses/MIT)

Фронтенд-приложение для хакатона от ЛБГУ в сфере EdTech

## 🛠 Технологический стек

- **Core:** React 18, JavaScript
- **Сборка:** Vite
- **Стилизация:** Tailwind CSS v4
- **Маршрутизация:** React Router v6
- **Инфраструктура:** Docker, Nginx

## 📂 Структура проекта

```text
src/
├── api/          # Настройка HTTP-клиента и запросов к бэкенду
├── components/   # Переиспользуемые UI-компоненты (Layout)
├── pages/        # Страницы приложения (Dashboard, 404)
├── App.jsx       # Конфигурация маршрутов
├── main.jsx      # Точка входа, провайдеры
└── index.css     # Глобальные стили и директивы Tailwind
