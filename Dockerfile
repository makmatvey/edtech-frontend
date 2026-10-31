# --- Этап 1: Сборка ---
FROM node:20-alpine as build

WORKDIR /app

# Сначала копируем только файлы зависимостей (для кэширования)
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci

# Копируем весь остальной код
COPY . .

# Собираем проект (создается папка dist)
RUN npm run build

# --- Этап 2: Раздача ---
FROM nginx:alpine

# Копируем наш конфиг Nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Копируем собранные файлы из первого этапа
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
