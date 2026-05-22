/** Rutas estáticas en /public (favicon, PWA, Open Graph). */
export const GAFCORE_FAVICON_PATH = "/favicon.png";
export const GAFCORE_APPLE_TOUCH_ICON_PATH = "/apple-touch-icon.png";

export function gafcoreHeadIconLinks() {
  return [
    { rel: "icon", type: "image/png", href: GAFCORE_FAVICON_PATH },
    { rel: "apple-touch-icon", href: GAFCORE_APPLE_TOUCH_ICON_PATH },
  ] as const;
}
