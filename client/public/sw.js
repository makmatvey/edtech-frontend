/*
 * Service worker «Класны».
 * — Оболочка приложения (index.html, манифест, иконки) — в кэше, страницы открываются без сети.
 * — Хэшированные /assets/* — stale-while-revalidate.
 * — /api/* НИКОГДА не кэшируется: журнал, оценки и личные данные идут только из сети.
 */
const VERSION = "klasna-v2";
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const SHELL_URLS = [
  "/",
  "/manifest.webmanifest",
  "/favicon_new.svg",
  "/icons/icon-192_new.png",
  "/icons/icon-512_new.png",
  "/icons/apple-touch-icon_new.png",
  "/icons/icon-maskable-192_new.png",
  "/icons/icon-maskable-512_new.png",
];
const MAX_ASSETS = 80;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(SHELL_URLS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(`${VERSION}-`)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isApi(url) {
  return url.pathname === "/api" || url.pathname.startsWith("/api/");
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

/** Навигация: сначала сеть (свежий index.html после деплоя), без сети — оболочка из кэша. */
async function navigate(request) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(request);
    if (res.ok && res.type === "basic") cache.put("/", res.clone());
    return res;
  } catch {
    return (await cache.match("/")) ?? Response.error();
  }
}

/** Статика: отдаём из кэша сразу и обновляем в фоне. */
async function staleWhileRevalidate(event, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(event.request);
  const network = fetch(event.request)
    .then((res) => {
      if (res.ok && res.type === "basic") {
        cache.put(event.request, res.clone()).then(() => cacheName === ASSETS && trim(ASSETS, MAX_ASSETS));
      }
      return res;
    })
    .catch(() => undefined);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  return (await network) ?? Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isApi(url)) return; // только сеть, без кэша
  if (request.mode === "navigate") {
    event.respondWith(navigate(request));
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(staleWhileRevalidate(event, ASSETS));
    return;
  }
  if (SHELL_URLS.includes(url.pathname) || url.pathname.startsWith("/icons/")) {
    event.respondWith(staleWhileRevalidate(event, SHELL));
  }
});
