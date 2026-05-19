import type { SupabaseClient } from "@supabase/supabase-js";
import { appendPipelineEvent, pipelineEventMessage } from "@/orchestrator/events.shared";
import type {
  GafcorePipelineRunRow,
  GafcorePipelineState,
  PipelineEvent,
  UserIntent,
} from "@/orchestrator/types";
import type { GafcoreExtendedPipelineStep } from "@/orchestrator/gafcore-build-pipeline.shared";

export async function assertProjectOwned(
  sb: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await sb
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data?.id);
}

export async function createPipelineRun(
  sb: SupabaseClient,
  input: {
    projectId: string;
    userId: string;
    instruction: string;
    intent: UserIntent;
    suggestedTemplateSlug: string;
  },
): Promise<GafcorePipelineRunRow | null> {
  const events: PipelineEvent[] = appendPipelineEvent([], {
    step: "interpret",
    state: "interpreting",
    message: pipelineEventMessage("interpret", "interpreting"),
    meta: { templateSlug: input.suggestedTemplateSlug },
  });

  const { data, error } = await sb
    .from("gafcore_pipeline_runs")
    .insert({
      project_id: input.projectId,
      user_id: input.userId,
      state: "interpreting",
      current_step: "interpret",
      instruction: input.instruction.slice(0, 8000),
      intent_json: input.intent,
      payload_json: { suggestedTemplateSlug: input.suggestedTemplateSlug },
      events_json: events,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[orchestrator] create run:", error);
    return null;
  }
  return mapRunRow(data);
}

export async function getPipelineRunForUser(
  sb: SupabaseClient,
  runId: string,
  userId: string,
): Promise<GafcorePipelineRunRow | null> {
  const { data, error } = await sb
    .from("gafcore_pipeline_runs")
    .select("*")
    .eq("id", runId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return mapRunRow(data);
}

export async function updatePipelineRun(
  sb: SupabaseClient,
  runId: string,
  userId: string,
  patch: {
    state?: GafcorePipelineState;
    current_step?: GafcoreExtendedPipelineStep | null;
    payload_json?: Record<string, unknown>;
    events_json?: PipelineEvent[];
    error_code?: string | null;
    error_message?: string | null;
    retry_count?: number;
  },
): Promise<GafcorePipelineRunRow | null> {
  const { data, error } = await sb
    .from("gafcore_pipeline_runs")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) {
    console.error("[orchestrator] update run:", error);
    return null;
  }
  return mapRunRow(data);
}

export async function appendRunStep(
  sb: SupabaseClient,
  run: GafcorePipelineRunRow,
  step: GafcoreExtendedPipelineStep,
  state: GafcorePipelineState,
  meta?: Record<string, unknown>,
): Promise<GafcorePipelineRunRow | null> {
  const events = appendPipelineEvent(run.events_json, {
    step,
    state,
    message: pipelineEventMessage(step, state),
    meta,
  });
  return updatePipelineRun(sb, run.id, run.user_id, {
    state,
    current_step: step,
    events_json: events,
  });
}

function mapRunRow(raw: Record<string, unknown>): GafcorePipelineRunRow {
  return {
    id: String(raw.id),
    project_id: String(raw.project_id),
    user_id: String(raw.user_id),
    state: raw.state as GafcorePipelineState,
    current_step: (raw.current_step as GafcorePipelineRunRow["current_step"]) ?? null,
    instruction: String(raw.instruction ?? ""),
    intent_json: (raw.intent_json ?? {}) as UserIntent,
    payload_json: (raw.payload_json ?? {}) as Record<string, unknown>,
    events_json: Array.isArray(raw.events_json) ? (raw.events_json as PipelineEvent[]) : [],
    error_code: raw.error_code ? String(raw.error_code) : null,
    error_message: raw.error_message ? String(raw.error_message) : null,
    retry_count: Number(raw.retry_count ?? 0),
    created_at: String(raw.created_at),
    updated_at: String(raw.updated_at),
  };
}
