/**
 * Service worker GafCore — precache conservador (solo estáticos en /public).
 * NO cachea HTML, JS con hash dinámico ni rutas /api/* (SSR + chat intactos).
 */
const CACHE = "gafcore-static-v2";
const PRECACHE_URLS = [
  "/manifest.webmanifest",
  "/favicon.png",
  "/favicon.svg",
  "/favicon-32.png",
  "/apple-touch-icon.png",
  "/gafcore-logo.png",
];

function isPrecachePath(pathname) {
  return PRECACHE_URLS.includes(pathname);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (!isPrecachePath(url.pathname)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            void caches.open(CACHE).then((c) => c.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
