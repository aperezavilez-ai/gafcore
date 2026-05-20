import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { taskPlanSchema, type TaskPlan } from "@/tasks/artifacts.shared";
import { seedTasksFromPlan } from "@/tasks/scheduler.server";
import {
  persistWorkflowFilesSnapshot,
  type WorkflowPayload,
} from "@/tasks/workflow-files.server";
import type { ProjFile } from "@/lib/gafcore-chat.shared";

export async function createWorkflowRun(
  projectId: string,
  userId: string,
  instruction: string,
  plan?: TaskPlan,
  pipelineRunId?: string,
  opts?: { files?: ProjFile[]; planSummary?: string },
): Promise<{ workflowRunId: string; planArtifactId?: string }> {
  const initialPayload: WorkflowPayload = { version: 1 };
  const { data: run, error } = await supabaseAdmin
    .from("gafcore_workflow_runs")
    .insert({
      project_id: projectId,
      user_id: userId,
      instruction,
      state: plan ? "executing" : "planning",
      pipeline_run_id: pipelineRunId ?? null,
      payload_json: initialPayload,
    })
    .select("id")
    .single();

  if (error || !run) throw new Error(error?.message ?? "workflow_insert_failed");

  let planArtifactId: string | undefined;

  if (plan) {
    const parsed = taskPlanSchema.parse(plan);
    const hash = createHash("sha256").update(JSON.stringify(parsed)).digest("hex").slice(0, 16);
    const { data: art } = await supabaseAdmin
      .from("gafcore_workflow_artifacts")
      .insert({
        workflow_run_id: run.id,
        kind: "task_plan",
        content_hash: hash,
        payload_json: parsed,
      })
      .select("id")
      .single();

    planArtifactId = art?.id;
    if (planArtifactId) {
      await supabaseAdmin
        .from("gafcore_workflow_runs")
        .update({ plan_artifact_id: planArtifactId, updated_at: new Date().toISOString() })
        .eq("id", run.id);
    }

    await seedTasksFromPlan(run.id, projectId, userId, parsed);
    if (opts?.files?.length) {
      await persistWorkflowFilesSnapshot(run.id, opts.files, opts.planSummary ?? parsed.summary);
    }
  }

  return { workflowRunId: run.id, planArtifactId };
}

export async function getWorkflowSnapshot(workflowRunId: string, userId: string) {
  const { data: run } = await supabaseAdmin
    .from("gafcore_workflow_runs")
    .select("*")
    .eq("id", workflowRunId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!run) return null;

  const { data: tasks } = await supabaseAdmin
    .from("gafcore_agent_tasks")
    .select("id, agent_type, state, priority, title, error_message, started_at, finished_at")
    .eq("workflow_run_id", workflowRunId)
    .order("created_at", { ascending: true });

  const payload =
    run.payload_json && typeof run.payload_json === "object" && !Array.isArray(run.payload_json)
      ? (run.payload_json as WorkflowPayload)
      : {};

  return {
    run,
    tasks: tasks ?? [],
    filesSnapshot: payload.filesSnapshot ?? [],
    mergedPatches: payload.mergedPatches ?? [],
    planSummary: payload.planSummary ?? null,
  };
}

const TERMINAL_WORKFLOW_STATES = new Set(["completed", "failed", "cancelled"]);

/** Cancela workflow y tareas no terminales (usuario). */
export async function cancelWorkflowRun(
  workflowRunId: string,
  userId: string,
): Promise<{ ok: boolean; error?: "not_found" | "already_terminal" }> {
  const { data: run } = await supabaseAdmin
    .from("gafcore_workflow_runs")
    .select("state")
    .eq("id", workflowRunId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!run) return { ok: false, error: "not_found" };
  if (TERMINAL_WORKFLOW_STATES.has(run.state)) {
    return { ok: true, error: "already_terminal" };
  }

  const now = new Date().toISOString();
  await supabaseAdmin
    .from("gafcore_agent_tasks")
    .update({
      state: "cancelled",
      lease_expires_at: null,
      finished_at: now,
      updated_at: now,
    })
    .eq("workflow_run_id", workflowRunId)
    .in("state", ["pending", "blocked", "ready", "running", "validating"]);

  await supabaseAdmin
    .from("gafcore_workflow_runs")
    .update({ state: "cancelled", updated_at: now })
    .eq("id", workflowRunId);

  return { ok: true };
}
