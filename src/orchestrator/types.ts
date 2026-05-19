import type { GafcoreBuildPipelineStep } from "@/orchestrator/gafcore-build-pipeline.shared";

export const GAFCORE_PIPELINE_STATES = [
  "pending",
  "interpreting",
  "generating",
  "validating",
  "retrying",
  "persisting_memory",
  "documenting",
  "deploying",
  "completed",
  "failed",
  "cancelled",
] as const;

export type GafcorePipelineState = (typeof GAFCORE_PIPELINE_STATES)[number];

export type UserIntentKind =
  | "build"
  | "fix"
  | "chat"
  | "deploy"
  | "docs"
  | "template";

export type ProjectTypeHint =
  | "blank"
  | "landing"
  | "ecommerce"
  | "app"
  | "unknown";

export type UserIntent = {
  kind: UserIntentKind;
  projectType: ProjectTypeHint;
  confidence: number;
  flags: {
    visualOnly: boolean;
    needsDeploy: boolean;
    needsDocs: boolean;
  };
};

export type PipelineFileSnapshot = {
  name: string;
  content: string;
  language?: string;
};

export type PipelineEvent = {
  at: string;
  step: GafcoreBuildPipelineStep | "document" | "deploy";
  state: GafcorePipelineState;
  message: string;
  meta?: Record<string, unknown>;
};

export type GafcorePipelineRunRow = {
  id: string;
  project_id: string;
  user_id: string;
  state: GafcorePipelineState;
  current_step: GafcoreBuildPipelineStep | "document" | "deploy" | null;
  instruction: string;
  intent_json: UserIntent;
  payload_json: Record<string, unknown>;
  events_json: PipelineEvent[];
  error_code: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
};
