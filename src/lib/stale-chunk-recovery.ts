const STALE_CHUNK_RELOAD_KEY = "gafcore:stale-chunk-reload-at";
const STALE_CHUNK_RELOAD_TTL_MS = 30_000;

const STALE_CHUNK_PATTERNS = [
  "Failed to fetch dynamically imported module",
  "Importing a module script failed",
  "error loading dynamically imported module",
  "ChunkLoadError",
  "Loading chunk",
  "modulepreload",
];

function readErrorText(value: unknown, seen = new Set<unknown>()): string {
  if (!value || seen.has(value)) return "";
  seen.add(value);

  if (typeof value === "string") return value;
  if (value instanceof Error) return `${value.name} ${value.message} ${value.stack ?? ""}`;
  if (typeof Event !== "undefined" && value instanceof Event) {
    const errorEvent = value as ErrorEvent;
    const promiseEvent = value as PromiseRejectionEvent;
    return [
      value.type,
      "message" in errorEvent ? errorEvent.message : "",
      "filename" in errorEvent ? errorEvent.filename : "",
      "error" in errorEvent ? readErrorText(errorEvent.error, seen) : "",
      "reason" in promiseEvent ? readErrorText(promiseEvent.reason, seen) : "",
    ].join(" ");
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return [
      readErrorText(record.error, seen),
      readErrorText(record.reason, seen),
      readErrorText(record.message, seen),
      readErrorText(record.name, seen),
      readErrorText(record.stack, seen),
    ].join(" ");
  }
  return String(value);
}

export function isStaleChunkError(error: unknown): boolean {
  const text = readErrorText(error).toLowerCase();
  if (!text) return false;
  return STALE_CHUNK_PATTERNS.some((pattern) => text.includes(pattern.toLowerCase()));
}

export async function clearGafcoreRuntimeCaches() {
  if (typeof window === "undefined") return;

  document.querySelectorAll('link[rel="manifest"]').forEach((el) => el.remove());

  await Promise.allSettled([
    "serviceWorker" in navigator
      ? navigator.serviceWorker
          .getRegistrations()
          .then((registrations) =>
            Promise.all(registrations.map((registration) => registration.unregister())),
          )
      : Promise.resolve(),
    "caches" in window
      ? caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      : Promise.resolve(),
  ]);
}

export function reloadAfterStaleChunkError(error: unknown, force = false): boolean {
  if (typeof window === "undefined") return false;
  if (!force && !isStaleChunkError(error)) return false;

  const now = Date.now();
  const lastReload = Number(window.sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY) ?? "0");
  if (!force && Number.isFinite(lastReload) && now - lastReload < STALE_CHUNK_RELOAD_TTL_MS) {
    return false;
  }

  window.sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, String(now));

  void clearGafcoreRuntimeCaches().finally(() => {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("__gafcore_refresh", String(now));
    window.location.replace(nextUrl.toString());
  });

  return true;
}

export function installStaleChunkRecovery() {
  if (typeof window === "undefined") return;
  const globalWindow = window as Window & {
    __gafcoreStaleChunkRecoveryInstalled?: boolean;
  };
  if (globalWindow.__gafcoreStaleChunkRecoveryInstalled) return;
  globalWindow.__gafcoreStaleChunkRecoveryInstalled = true;

  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    reloadAfterStaleChunkError(event, true);
  });
  window.addEventListener("error", (event) => {
    reloadAfterStaleChunkError(event);
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (reloadAfterStaleChunkError(event)) event.preventDefault();
  });
}
