/** Puerto Vite de GafCore en local (ver vite.config.ts). */
export const GAFCORE_DEV_PORT = 5174;

export type GafcoreDevPortWarning = {
  reason: string;
  /** URL completa recomendada (p. ej. IDE). */
  suggestedUrl: string;
};

/**
 * En desarrollo: avisa si el usuario abrió localhost:8080 u otro puerto
 * donde suele correr otra app (GafSuite, etc.) en lugar de GafCore.
 */
export function getGafcoreDevPortWarning(
  path = "/gafcore/app",
): GafcoreDevPortWarning | null {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;

  const { hostname, port: portStr, protocol } = window.location;
  const port = portStr
    ? Number(portStr)
    : protocol === "https:"
      ? 443
      : 80;
  const base = `http://127.0.0.1:${GAFCORE_DEV_PORT}`;
  const suggestedUrl = `${base}${path.startsWith("/") ? path : `/${path}`}`;

  if (port === 8080) {
    return {
      reason:
        "El puerto 8080 suele ser de otro proyecto en tu PC (no es GafCore).",
      suggestedUrl,
    };
  }

  const isLocalHost =
    hostname === "localhost" || hostname === "[::1]" || hostname === "::1";
  if (isLocalHost && port !== GAFCORE_DEV_PORT) {
    return {
      reason: `En local, ${hostname}:${port} puede cargar otra app. GafCore usa 127.0.0.1:${GAFCORE_DEV_PORT}.`,
      suggestedUrl,
    };
  }

  return null;
}
