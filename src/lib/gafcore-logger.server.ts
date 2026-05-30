/**
 * Logs de servidor: solo desarrollo en consola; producción → JSON mínimo en warn/error reales.
 */
const IS_DEV =
  process.env.NODE_ENV !== "production" ||
  process.env.VERCEL_ENV === "development" ||
  process.env.GAFCORE_DEBUG === "1";

export function logDev(event: string, meta?: Record<string, unknown>): void {
  if (!IS_DEV) return;
  if (meta) console.info(JSON.stringify({ event, ...meta }));
  else console.info(`[gafcore] ${event}`);
}

export function logWarn(event: string, meta?: Record<string, unknown>): void {
  const payload = { event, ...meta };
  console.warn(JSON.stringify(payload));
}

export function logError(event: string, meta?: Record<string, unknown>): void {
  const safe = meta ? redactSecrets(meta) : {};
  console.error(JSON.stringify({ event, ...safe }));
}

function redactSecrets(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (/key|secret|token|password|authorization/i.test(k)) {
      out[k] = "[redacted]";
    } else if (typeof v === "string" && /sk-[a-zA-Z0-9]{8,}/.test(v)) {
      out[k] = "[redacted]";
    } else {
      out[k] = v;
    }
  }
  return out;
}
