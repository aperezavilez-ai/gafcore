/** Clave localStorage del workflow de orquestación por proyecto (Fase 5). */
export function gafcoreOrchestrationStorageKey(projectId: string): string {
  return `gafcore_orchestration_workflow_${projectId}`;
}

export function readOrchestrationRunId(projectId: string | null | undefined): string | null {
  if (!projectId || typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(gafcoreOrchestrationStorageKey(projectId));
  } catch {
    return null;
  }
}

export function persistOrchestrationRunId(projectId: string, runId: string): void {
  try {
    window.localStorage.setItem(gafcoreOrchestrationStorageKey(projectId), runId);
  } catch {
    /* quota / private mode */
  }
}

export function clearOrchestrationRunId(projectId: string | null | undefined): void {
  if (!projectId || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(gafcoreOrchestrationStorageKey(projectId));
  } catch {
    /* */
  }
}
