import type { GafcoreBuildPipelineStep } from "@/orchestrator/gafcore-build-pipeline.shared";
import type { GafcorePipelineState, PipelineEvent } from "@/orchestrator/types";

const MAX_EVENTS = 50;

export function appendPipelineEvent(
  events: PipelineEvent[],
  partial: Omit<PipelineEvent, "at">,
): PipelineEvent[] {
  const next: PipelineEvent = { ...partial, at: new Date().toISOString() };
  const merged = [...events, next];
  return merged.length > MAX_EVENTS ? merged.slice(-MAX_EVENTS) : merged;
}

export function pipelineEventMessage(
  step: GafcoreBuildPipelineStep | "document" | "deploy",
  state: GafcorePipelineState,
): string {
  const labels: Record<string, string> = {
    interpret: "Interpretando intención",
    generate: "Generando código",
    validate: "Validando proyecto",
    retry: "Reintentando corrección",
    memory: "Guardando memoria IA",
    build_smoke: "Comprobando compilación",
    design_critique: "Auditoría de diseño",
    document: "Generando documentación",
    deploy: "Preparando deploy",
  };
  const base = labels[step] ?? step;
  if (state === "failed") return `${base} — error`;
  if (state === "completed") return `${base} — listo`;
  return base;
}
