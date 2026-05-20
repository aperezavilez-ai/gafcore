import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { taskPlanSchema, type TaskPlan } from "@/tasks/artifacts.shared";
import { seedTasksFromPlan } from "@/tasks/scheduler.server";

export async function createWorkflowRun(
  projectId: string,
  userId: string,
  instruction: string,
  plan?: TaskPlan,
  pipelineRunId?: string,
): Promise<{ workflowRunId: string; planArtifactId?: string }> {
  const { data: run, error } = await supabaseAdmin
    .from("gafcore_workflow_runs")
    .insert({
      project_id: projectId,
      user_id: userId,
      instruction,
      state: plan ? "executing" : "planning",
      pipeline_run_id: pipelineRunId ?? null,
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

  return { run, tasks: tasks ?? [] };
}
