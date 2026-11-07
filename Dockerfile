# «Класна» — один контейнер = одна школа (своя база, свой код школы, свой секрет).
# Сборка: docker build -t klasna .
# Запуск одной школы:  см. docs/DEPLOY.md; несколько школ — docker-compose.example.yml

# ── 1. Сборка клиента и сервера (нужны dev-зависимости: typescript, vite) ──
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY server server
COPY client client
RUN npm run build -w client && npm run build -w server

# ── 2. Рабочий образ: только production-зависимости сервера, без tsx и typescript ──
FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=3001
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev -w server --include-workspace-root=false && npm cache clean --force
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist
COPY materials/README.md materials/README.md
# база, секретные файлы и резервные копии — в томе /app/data
RUN mkdir -p /app/data && chown -R node:node /app/data /app/materials
USER node
VOLUME ["/app/data"]
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--no-warnings=ExperimentalWarning", "server/dist/index.js"]
