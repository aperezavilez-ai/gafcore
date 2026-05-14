/**
 * Origen público del sitio (canonical, Open Graph, etc.).
 * En Vercel Production: opcional `VITE_PUBLIC_SITE_URL` si el canónico es `www` o preview.
 * Sin variable en build de producción: `https://gafcore.com`.
 */
export function getPublicSiteOrigin(): string {
  const fromEnv = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.trim();
  if (fromEnv && (fromEnv.startsWith("http://") || fromEnv.startsWith("https://"))) {
    return fromEnv.replace(/\/$/, "");
  }
  if (import.meta.env.DEV) {
    if (typeof window !== "undefined" && window.location?.origin) {
      return window.location.origin.replace(/\/$/, "");
    }
    return "http://127.0.0.1:8080";
  }
  return "https://gafcore.com";
}
