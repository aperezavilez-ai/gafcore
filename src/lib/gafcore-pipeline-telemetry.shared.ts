/**
 * Telemetría estructurada del pipeline IA → archivos → preview.
 * warn/error siempre en consola (JSON); info solo en desarrollo.
 */

const IS_DEV =
  typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);

export type PipelinePhase =
  | "chat"
  | "apply"
  | "persist"
  | "preview"
  | "rollback"
  | "cache";

export type PipelineLogLevel = "info" | "warn" | "error";

export function pipelineTraceMeta(
  ctx: {
    traceId?: string | number | null;
    projectId?: string | null;
    phase?: PipelinePhase;
    pipelineRunId?: string | null;
  },
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...(extra ?? {}) };
  if (ctx.traceId != null) out.traceId = ctx.traceId;
  if (ctx.projectId) out.projectId = ctx.projectId;
  if (ctx.phase) out.phase = ctx.phase;
  if (ctx.pipelineRunId) out.pipelineRunId = ctx.pipelineRunId;
  return out;
}

export function logPipelineEvent(
  level: PipelineLogLevel,
  event: string,
  meta?: Record<string, unknown>,
): void {
  if (level === "info" && !IS_DEV) return;
  const payload = { ts: new Date().toISOString(), event, level, ...(meta ?? {}) };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(`[gafcore-pipeline] ${line}`);
  else if (level === "warn") console.warn(`[gafcore-pipeline] ${line}`);
  else console.info(`[gafcore-pipeline] ${line}`);
}
