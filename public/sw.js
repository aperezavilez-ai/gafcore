/**
 * Service worker mínimo para habilitar instalación PWA de GafCore.
 * No cachea HTML/API (SSR); la app sigue requiriendo red.
 */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
