/** Rutas estáticas en /public (favicon, PWA, Open Graph). */
export const GAFCORE_FAVICON_SVG_PATH = "/favicon.svg";
export const GAFCORE_FAVICON_PATH = "/favicon.png";
export const GAFCORE_APPLE_TOUCH_ICON_PATH = "/apple-touch-icon.png";

/** Inline: evita 404 en /favicon.ico y caché del icono genérico (Cursor Simple Browser). */
const FAVICON_SVG_MARKUP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="gc" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#22d3ee"/></linearGradient></defs><rect width="32" height="32" rx="8" fill="url(#gc)"/><text x="16" y="22" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif" font-size="18" font-weight="700">G</text></svg>`;

export const GAFCORE_FAVICON_INLINE = `data:image/svg+xml,${encodeURIComponent(FAVICON_SVG_MARKUP)}`;

export function gafcoreHeadIconLinks() {
  return [
    { rel: "icon", href: GAFCORE_FAVICON_INLINE },
    { rel: "shortcut icon", href: GAFCORE_FAVICON_INLINE },
    { rel: "icon", type: "image/svg+xml", href: GAFCORE_FAVICON_SVG_PATH },
    { rel: "icon", type: "image/png", sizes: "32x32", href: GAFCORE_FAVICON_PATH },
    { rel: "apple-touch-icon", href: GAFCORE_APPLE_TOUCH_ICON_PATH },
  ] as const;
}
