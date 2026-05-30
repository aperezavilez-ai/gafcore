import type { AiBrainTaskKind } from "@/services/ai/types.shared";

const TASK_LABELS: Record<AiBrainTaskKind, string> = {
  code: "Generación de código",
  design: "Diseño visual",
  frontend: "Frontend / UI",
  chat: "Chat rápido",
  voice: "Voz (ElevenLabs)",
  support: "Soporte",
  fix: "Corrección",
  deploy: "Publicación",
};

/** Etiquetas UI para tipos de tarea del orquestador (sin llamadas a proveedores). */
export function useAiTaskLabels() {
  return { labels: TASK_LABELS };
}

export function aiTaskLabel(task: AiBrainTaskKind): string {
  return TASK_LABELS[task] ?? task;
}
