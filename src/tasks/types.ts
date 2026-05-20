/** Agent Task System — tipos compartidos (A0). */

export const WORKFLOW_STATES = [
  "pending",
  "planning",
  "executing",
  "validating",
  "merging",
  "completed",
  "failed",
  "cancelled",
] as const;

export type WorkflowState = (typeof WORKFLOW_STATES)[number];

export const TASK_STATES = [
  "pending",
  "blocked",
  "ready",
  "running",
  "validating",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export type TaskState = (typeof TASK_STATES)[number];

export const TASK_PRIORITIES = ["critical", "high", "normal", "low"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const AGENT_TYPES = [
  "planner",
  "frontend",
  "backend",
  "database",
  "validation",
  "deployment",
  "documentation",
  "refactor",
  "debug",
] as const;

export type AgentType = (typeof AGENT_TYPES)[number];

export type FileScope = {
  allow?: string[];
  deny?: string[];
};

export type WorkflowRunRow = {
  id: string;
  project_id: string;
  user_id: string;
  state: WorkflowState;
  instruction: string;
  pipeline_run_id: string | null;
  plan_artifact_id: string | null;
  payload_json: Record<string, unknown>;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type AgentTaskRow = {
  id: string;
  workflow_run_id: string;
  project_id: string;
  user_id: string;
  agent_type: AgentType;
  state: TaskState;
  priority: TaskPriority;
  title: string;
  instruction: string;
  file_scope: FileScope;
  file_locks: string[];
  input_artifact_ids: string[];
  output_artifact_ids: string[];
  retry_count: number;
  max_retries: number;
  idempotency_key: string | null;
  lease_expires_at: string | null;
  error_code: string | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskLogRow = {
  id: string;
  task_id: string;
  level: "info" | "warn" | "error";
  event: string;
  message: string;
  meta_json: Record<string, unknown>;
  created_at: string;
};

export type WorkflowArtifactRow = {
  id: string;
  workflow_run_id: string;
  task_id: string | null;
  kind: string;
  content_hash: string;
  payload_json: Record<string, unknown>;
  created_at: string;
};
