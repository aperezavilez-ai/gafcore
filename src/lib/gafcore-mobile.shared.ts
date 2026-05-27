/**
 * Enlaces y configuración de apps móviles GafCore (PWA + tiendas).
 * Definir en Vercel cuando las fichas estén publicadas:
 * - VITE_GAFCORE_PLAY_STORE_URL
 * - VITE_GAFCORE_APP_STORE_URL
 */

export const GAFCORE_PWA_MANIFEST_PATH = "/manifest.webmanifest";

export const GAFCORE_MOBILE_START_URL = "/gafcore/app";

/** URL de producción cargada por la app Capacitor nativa. */
export const GAFCORE_MOBILE_SERVER_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_GAFCORE_MOBILE_SERVER_URL?.trim()) ||
  "https://gafcore.com";

export function getGafcorePlayStoreUrl(): string | null {
  const url =
    typeof import.meta !== "undefined" ? import.meta.env?.VITE_GAFCORE_PLAY_STORE_URL?.trim() : "";
  return url || null;
}

export function getGafcoreAppStoreUrl(): string | null {
  const url =
    typeof import.meta !== "undefined" ? import.meta.env?.VITE_GAFCORE_APP_STORE_URL?.trim() : "";
  return url || null;
}

export function getGafcoreMobileDownloadLinks(): {
  playStore: string | null;
  appStore: string | null;
  webApp: string;
  pwaHint: boolean;
} {
  return {
    playStore: getGafcorePlayStoreUrl(),
    appStore: getGafcoreAppStoreUrl(),
    webApp: `${GAFCORE_MOBILE_SERVER_URL}${GAFCORE_MOBILE_START_URL}`,
    pwaHint: true,
  };
}
