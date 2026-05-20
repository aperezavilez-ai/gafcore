import type { SupabaseClient } from "@supabase/supabase-js";
import { appendPipelineEvent } from "@/orchestrator/events.shared";
import {
  getPipelineRunForUser,
  updatePipelineRun,
} from "@/lib/gafcore-orchestrator.server";
import type { GafcorePipelineState } from "@/orchestrator/types";

/** Enlaza pipeline ↔ workflow: evento en `events_json` + `workflowRunId` en payload. */
export async function syncPipelineWithWorkflow(
  sb: SupabaseClient,
  pipelineRunId: string,
  userId: string,
  opts: {
    workflowRunId: string;
    workflowState: string;
    planSummary?: string;
  },
): Promise<void> {
  const run = await getPipelineRunForUser(sb, pipelineRunId, userId);
  if (!run) return;

  let pipelineState: GafcorePipelineState = "generating";
  if (opts.workflowState === "completed") pipelineState = "completed";
  else if (opts.workflowState === "failed") pipelineState = "failed";
  else if (opts.workflowState === "cancelled") pipelineState = "cancelled";

  const message =
    opts.workflowState === "completed"
      ? `Multiagente completado: ${opts.planSummary?.slice(0, 80) ?? "listo"}`
      : opts.workflowState === "failed"
        ? "Multiagente falló"
        : opts.workflowState === "cancelled"
          ? "Multiagente cancelado"
          : `Multiagente (${opts.workflowState})`;

  const events = appendPipelineEvent(run.events_json, {
    step: "generate",
    state: pipelineState,
    message,
    meta: {
      workflowRunId: opts.workflowRunId,
      workflowState: opts.workflowState,
    },
  });

  const payload = {
    ...(typeof run.payload_json === "object" && run.payload_json && !Array.isArray(run.payload_json)
      ? run.payload_json
      : {}),
    workflowRunId: opts.workflowRunId,
    lastWorkflowState: opts.workflowState,
  };

  await updatePipelineRun(sb, pipelineRunId, userId, {
    state: pipelineState,
    current_step: pipelineState === "completed" ? "validate" : "generate",
    events_json: events,
    payload_json: payload,
  });
}
