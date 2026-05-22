/** Rutas estáticas en /public (favicon, PWA, Open Graph). */
export const GAFCORE_FAVICON_SVG_PATH = "/favicon.svg";
export const GAFCORE_FAVICON_PATH = "/favicon.png";
export const GAFCORE_APPLE_TOUCH_ICON_PATH = "/apple-touch-icon.png";

export function gafcoreHeadIconLinks() {
  return [
    { rel: "icon", type: "image/svg+xml", href: GAFCORE_FAVICON_SVG_PATH },
    { rel: "icon", type: "image/png", sizes: "32x32", href: GAFCORE_FAVICON_PATH },
    { rel: "apple-touch-icon", href: GAFCORE_APPLE_TOUCH_ICON_PATH },
  ] as const;
}
