/**
 * Logging en el navegador: solo en desarrollo. Producción no escribe en consola.
 */
const IS_DEV =
  typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);

export function logClientDev(event: string, meta?: Record<string, unknown>): void {
  if (!IS_DEV) return;
  if (meta) console.info(`[gafcore] ${event}`, meta);
  else console.info(`[gafcore] ${event}`);
}

export function logClientWarn(event: string, meta?: unknown): void {
  if (!IS_DEV) return;
  console.warn(`[gafcore] ${event}`, meta ?? "");
}

export function logClientError(event: string, meta?: unknown): void {
  if (!IS_DEV) return;
  console.error(`[gafcore] ${event}`, meta ?? "");
}

/** QA debug panel: diagnóstico estructurado solo en dev. */
export function logClientDebugGroup(title: string, payload: Record<string, unknown>): void {
  if (!IS_DEV) return;
  console.group(title);
  for (const [k, v] of Object.entries(payload)) {
    console.info(k, v);
  }
  console.groupEnd();
}
