/**
 * Service worker de retirada: desregistra y borra cachés PWA antiguos.
 * No precachea ni intercepta fetch. GafCore es solo web en el navegador.
 */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .catch(() => self.registration.unregister()),
  );
});
