/**
 * Pipeline de construcción GafCore (Etapa 7).
 * Pasos declarativos; ejecución en servidor vía gafcore-orchestrator-pipeline.server.
 */
import type { ProjectValidationIssue } from "@/lib/gafcore-ai-validation.shared";
import {
  hasBlockingValidationIssues,
  shouldAutoRetryValidation,
} from "@/lib/gafcore-ai-validation.shared";

export const GAFCORE_BUILD_PIPELINE_STEPS = [
  "interpret",
  "generate",
  "validate",
  "retry",
  "memory",
] as const;

export type GafcoreBuildPipelineStep = (typeof GAFCORE_BUILD_PIPELINE_STEPS)[number];

export const GAFCORE_EXTENDED_PIPELINE_STEPS = [
  ...GAFCORE_BUILD_PIPELINE_STEPS,
  "document",
  "deploy",
] as const;

export type GafcoreExtendedPipelineStep = (typeof GAFCORE_EXTENDED_PIPELINE_STEPS)[number];

export function pipelineShouldRetry(issues: ProjectValidationIssue[]): boolean {
  return shouldAutoRetryValidation(issues);
}

export function pipelineIsSuccess(issues: ProjectValidationIssue[]): boolean {
  return !hasBlockingValidationIssues(issues);
}
