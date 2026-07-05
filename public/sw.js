self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .catch(() => undefined),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .catch(() => undefined),
      self.registration.unregister().catch(() => undefined),
      self.clients
        .matchAll({ includeUncontrolled: true, type: "window" })
        .then((clients) => {
          for (const client of clients) {
            client.navigate(client.url).catch(() => undefined);
          }
        })
        .catch(() => undefined),
    ]),
  );
});

self.addEventListener("fetch", () => {
  // This worker intentionally does not intercept requests.
});
