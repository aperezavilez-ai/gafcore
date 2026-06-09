import { logDev } from "@/lib/gafcore-logger.server";

/** Intentos totales (1 inicial + reintentos). */
export const GAFCORE_AI_UPSTREAM_MAX_ATTEMPTS = 3;

export const GAFCORE_AI_UPSTREAM_RETRY_DELAY_MS = 2000;

/** Errores transitorios del proveedor (sobrecarga, gateway, timeout). */
export function isTransientUpstreamError(status: number): boolean {
  return status === 529 || status === 502 || status === 503 || status === 504 || status === 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function drainResponseBody(res: Response): Promise<void> {
  try {
    await res.text();
  } catch {
    /* noop */
  }
}

/**
 * Reintenta llamadas upstream ante 529 (overloaded) u otros errores temporales.
 * Espera 2 s entre intentos; tras agotar reintentos devuelve la última respuesta fallida.
 */
export async function withTransientUpstreamRetry(
  call: () => Promise<Response>,
  meta?: Record<string, unknown>,
): Promise<Response> {
  let lastRes: Response | null = null;

  for (let attempt = 1; attempt <= GAFCORE_AI_UPSTREAM_MAX_ATTEMPTS; attempt++) {
    const res = await call();
    if (res.ok || !isTransientUpstreamError(res.status) || attempt === GAFCORE_AI_UPSTREAM_MAX_ATTEMPTS) {
      return res;
    }

    await drainResponseBody(res);
    lastRes = res;
    logDev("gafcore_ai_upstream_retry", {
      ...meta,
      status: res.status,
      attempt,
      maxAttempts: GAFCORE_AI_UPSTREAM_MAX_ATTEMPTS,
      delayMs: GAFCORE_AI_UPSTREAM_RETRY_DELAY_MS,
    });

    if (attempt < GAFCORE_AI_UPSTREAM_MAX_ATTEMPTS) {
      await sleep(GAFCORE_AI_UPSTREAM_RETRY_DELAY_MS);
    }
  }

  return lastRes!;
}
