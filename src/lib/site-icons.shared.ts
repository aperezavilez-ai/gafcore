/** Rutas estáticas en /public (favicon, PWA, Open Graph). */
import { GAFCORE_PWA_MANIFEST_PATH } from "@/lib/gafcore-mobile.shared";
/** ?v= rompe caché del icono genérico en pestañas. */
export const FAVICON_CACHE_VERSION = "gafcore-4";

export const GAFCORE_FAVICON_SVG_PATH = `/favicon.svg?v=${FAVICON_CACHE_VERSION}`;
export const GAFCORE_FAVICON_PATH = `/favicon.png?v=${FAVICON_CACHE_VERSION}`;
export const GAFCORE_APPLE_TOUCH_ICON_PATH = `/apple-touch-icon.png?v=${FAVICON_CACHE_VERSION}`;

/** Inline: evita 404 en /favicon.ico y caché del icono genérico (Cursor Simple Browser). */
const FAVICON_SVG_MARKUP = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><linearGradient id="gc" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#a855f7"/><stop offset="50%" stop-color="#d946ef"/><stop offset="100%" stop-color="#22d3ee"/></linearGradient></defs><rect width="32" height="32" rx="7" fill="#000"/><path d="M16 4 L26 9.5 V22.5 L16 28 L6 22.5 V9.5 Z" fill="none" stroke="url(#gc)" stroke-width="1.5"/><text x="16" y="21" text-anchor="middle" fill="url(#gc)" font-family="system-ui,sans-serif" font-size="14" font-weight="800">G</text></svg>`;

export const GAFCORE_FAVICON_INLINE = `data:image/svg+xml,${encodeURIComponent(FAVICON_SVG_MARKUP)}`;

/** PNG 32×32 embebido: funciona en Vercel aunque /public no esté en CDN. */
export const GAFCORE_FAVICON_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAANuSURBVFhH7c5/UItxHAfwWu1ZllZr/RKNFGpJuilzFx1yfh+HCdcd15Hu/Kaju/CsNEfXkkZi08i6aXWmCAmJ7ohxmuRHfhwiUzRGa8/z/T5fNo8ff/Bvf7jn9d/n/X7ueX9dGAwGg/E3Nn/l9DfiGi599h+E4yw7N7fI4qpEr7hVh+i4fyARjpGcrPIvrnmoEyur7xrV5EVXTkikx6w8VXK37wkJHf2iiekZe1j8UZi6hBqXnEpNpWOnMWWUp0hFhdPnvxEeGTv6WDLUgx3SOcYqQs2L8Li+zWlLUYSj72UrKj+7H3zxzk37+bXvuV+PQDhiqSK7n+YkfkpJmU+8npYG2hMyyCS6dolQIXHIEbBtiBYso6O/I1jbT31iFzTqpXq32oD2PSWhFpSeRKKZq6HM5q8It7nn30Piw2yzf3U4+v6N0d8kvRzyZFO5xBJfGNvzYO28vq3JUjI/IRPxJ+DWgNFyKjFaSUWHqanJw7XUAu+T4JGgnorjXQXLvJvtUnr2NyurwPAGKyu55t2yqSKwA+2OthlmpoIXsTkwm+TunWVjKxTmofqgl9zTBx/zG5be8jXiZ4Kfn9fGdG2VS6xt6+f3JkxPBR2SLbAqGqckI3fBwhHFIC3kKFQGlUM1txo8ETSAdPY1UMu+Q1wRtlGD6Okf3rK0hgcedaragGcrS4d/OKCXIrfRu4ApRA2zCS+FpBfbr+8ZavB5zqnObfG8XnrVr9VQOazDVDq2e/nOiV9qHP+YgVO82CxSE5ULS8LyYKFQTa0K1kKloIqUD7gA6jyaQArnJnmfc9d+m2cixjmHf2rFLurqfNq6iiMsYscdIwcpwSUQ8GpAJkpscLe6Fz82s3Wyh5xLp4385qOX/dpqSiO7DxTHfVyekWQ7MyedXDhpAywQZcPjkflwt1AJrws0sMKvEir556Cc00De5N+wr8KMhG6giVgtNiK2c/inRp+WSceHvP+6ZYLdOnkNVIcpIPSuIjsDG22hjr5LoIno5Jw81u5ZL2sVtWK1g5/laaLMsqIplviNs21pM9ZRvPHb4L4oOVRIFK8GDD4Cc4J1YGfQWbs08BI5l9sEVng1k3O494hMzxZ7NkLI1Tn8p1zJ1/jFi8h3MTsgCjoGHgrrfoz3q2lZVKhoP5SLKihfOmIwGAzG/8zF5RsHN5vL5pllZQAAAABJRU5ErkJggg==";

export function gafcoreHeadIconLinks() {
  return [
    { rel: "icon", href: GAFCORE_FAVICON_INLINE },
    { rel: "shortcut icon", href: GAFCORE_FAVICON_INLINE },
    { rel: "icon", type: "image/svg+xml", href: GAFCORE_FAVICON_SVG_PATH },
    { rel: "icon", type: "image/png", sizes: "32x32", href: GAFCORE_FAVICON_PATH },
    { rel: "apple-touch-icon", href: GAFCORE_APPLE_TOUCH_ICON_PATH },
    { rel: "manifest", href: GAFCORE_PWA_MANIFEST_PATH },
  ] as const;
}

export function gafcorePwaMetaTags() {
  return [
    { name: "mobile-web-app-capable", content: "yes" },
    { name: "apple-mobile-web-app-capable", content: "yes" },
    { name: "apple-mobile-web-app-title", content: "GafCore" },
    { name: "application-name", content: "GafCore" },
  ] as const;
}
