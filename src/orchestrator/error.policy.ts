import type { ProjectValidationIssue } from "@/lib/gafcore-ai-validation.shared";
import { pipelineShouldRetry } from "@/orchestrator/gafcore-build-pipeline.shared";

export const MAX_PIPELINE_RETRIES = 2;

export type OrchestratorErrorCode =
  | "PROJECT_NOT_FOUND"
  | "RUN_NOT_FOUND"
  | "RUN_TERMINAL"
  | "VALIDATION_FAILED"
  | "UNAUTHORIZED";

export function orchestratorShouldRetry(
  issues: ProjectValidationIssue[],
  retryCount: number,
): boolean {
  return retryCount < MAX_PIPELINE_RETRIES && pipelineShouldRetry(issues);
}

export function mapOrchestratorErrorMessage(code: OrchestratorErrorCode): string {
  const map: Record<OrchestratorErrorCode, string> = {
    PROJECT_NOT_FOUND: "Proyecto no encontrado.",
    RUN_NOT_FOUND: "Ejecución del pipeline no encontrada.",
    RUN_TERMINAL: "Esta ejecución ya finalizó.",
    VALIDATION_FAILED: "La validación del proyecto falló.",
    UNAUTHORIZED: "No tienes permiso para esta acción.",
  };
  return map[code] ?? "Error del orquestador.";
}
