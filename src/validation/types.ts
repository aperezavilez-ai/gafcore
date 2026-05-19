import type { ProjectValidationIssue } from "@/lib/gafcore-ai-validation.shared";

export type ValidationPhase = "post_generate" | "pre_deploy" | "manual";

export type ValidationStatus =
  | "running"
  | "approved"
  | "approved_with_warnings"
  | "failed";

export type ValidationFileInput = {
  name: string;
  content: string;
  language?: string;
};

export type ValidationRunInput = {
  files: ValidationFileInput[];
  phase: ValidationPhase;
  projectId?: string;
  userId?: string;
  pipelineRunId?: string;
};

export type QualityDimensions = {
  stability: number;
  compatibility: number;
  functionality: number;
  structure: number;
  security: number;
  maintainability: number;
  performance: number;
};

export type ValidationLogEvent = {
  at: string;
  event: string;
  meta?: Record<string, unknown>;
};

export type ValidationReport = {
  status: ValidationStatus;
  approved: boolean;
  overallScore: number;
  dimensions: QualityDimensions;
  issues: ProjectValidationIssue[];
  blockingErrorCount: number;
  warningCount: number;
  logs: ValidationLogEvent[];
};
