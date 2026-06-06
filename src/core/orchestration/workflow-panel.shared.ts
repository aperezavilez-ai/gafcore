/**
 * Mapeo workflow DB → panel de pasos encima del compositor (Fase 3).
 */
import type { GafcoreChatNextStep, GafcoreChatStepStatus } from "@/lib/gafcore-chat-suggestions.shared";
import type { WorkflowTaskUi } from "@/components/ide/WorkflowTaskStrip";

export const GAFCORE_WORKFLOW_STEP_PREFIX = "[WORKFLOW GAFCORE";

function taskToStepStatus(state: string): GafcoreChatStepStatus {
  if (state === "succeeded") return "completed";
  if (state === "running" || state === "validating") return "current";
  if (state === "failed" || state === "cancelled") return "upcoming";
  return "upcoming";
}

function statusRank(status: GafcoreChatStepStatus): number {
  if (status === "completed") return 3;
  if (status === "current") return 1;
  return 2;
}

/** Primera tarea ready (o running) según prioridad del workflow. */
export function pickCurrentOrchestrationTask(tasks: WorkflowTaskUi[]): WorkflowTaskUi | null {
  const ready = tasks.filter((t) => t.state === "ready" || t.state === "running");
  if (ready.length === 0) return null;
  const running = ready.find((t) => t.state === "running");
  if (running) return running;
  return ready[0] ?? null;
}

export function mapWorkflowTasksToPanelSteps(tasks: WorkflowTaskUi[]): GafcoreChatNextStep[] {
  if (tasks.length === 0) return [];

  let currentAssigned = false;
  const mapped = tasks.map((task, index) => {
    let status = taskToStepStatus(task.state);
    if (status === "completed") {
      /* keep completed */
    } else if (!currentAssigned && (task.state === "ready" || task.state === "running")) {
      status = "current";
      currentAssigned = true;
    } else if (status !== "completed") {
      status = task.state === "blocked" || task.state === "pending" ? "upcoming" : status;
      if (status === "current" && currentAssigned) status = "upcoming";
    }
    return {
      id: task.id,
      label: `${index + 1}. ${task.title}`,
      prompt: buildWorkflowStepInstruction(task),
      status,
      order: index + 1,
    };
  });

  if (!currentAssigned) {
    const nextUp = mapped.find((s) => s.status === "upcoming");
    if (nextUp) nextUp.status = "current";
  }

  return mapped.sort((a, b) => a.order - b.order);
}

export function buildWorkflowStepInstruction(task: WorkflowTaskUi): string {
  const detail = task.instruction?.trim();
  return (
    `${GAFCORE_WORKFLOW_STEP_PREFIX} — ${task.title}] ` +
    "Ejecuta SOLO esta tarea del workflow del proyecto. " +
    (detail ? `${detail} ` : "") +
    "Responde JSON { reply, files } aplicable al preview. " +
    "Conserva el diseño y código existente salvo lo necesario para esta tarea."
  );
}

export function isWorkflowStepInstruction(text: string): boolean {
  return text.includes(GAFCORE_WORKFLOW_STEP_PREFIX);
}

export function workflowPanelProgress(tasks: WorkflowTaskUi[]): {
  completed: number;
  total: number;
  blocked: number;
} {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.state === "succeeded").length;
  const blocked = tasks.filter((t) => t.state === "failed").length;
  return { completed, total, blocked };
}

export function mergeWorkflowStepsForDisplay(
  workflowSteps: GafcoreChatNextStep[],
  legacySteps: GafcoreChatNextStep[],
): GafcoreChatNextStep[] {
  if (workflowSteps.length > 0) return workflowSteps;
  return legacySteps;
}

/** Orden visual: current primero entre los no completados. */
export function sortPanelStepsForChips(steps: GafcoreChatNextStep[]): GafcoreChatNextStep[] {
  return [...steps].sort((a, b) => {
    const dr = statusRank(a.status) - statusRank(b.status);
    if (dr !== 0) return dr;
    return a.order - b.order;
  });
}
