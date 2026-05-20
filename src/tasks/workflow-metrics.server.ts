import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { countActiveWorkflowsForUser, getMaxActiveWorkflowsPerUser } from "@/tasks/workflow-limits.server";

export type WorkflowTaskCounts = {
  total: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  running: number;
  ready: number;
  pending: number;
  blocked: number;
};

export type WorkflowRunMetrics = {
  taskCounts: WorkflowTaskCounts;
  durationMs: number | null;
  wavesEstimate: number | null;
};

export function countTasksByState(
  tasks: Array<{ state: string }>,
): WorkflowTaskCounts {
  const counts: WorkflowTaskCounts = {
    total: tasks.length,
    succeeded: 0,
    failed: 0,
    cancelled: 0,
    running: 0,
    ready: 0,
    pending: 0,
    blocked: 0,
  };
  for (const t of tasks) {
    switch (t.state) {
      case "succeeded":
        counts.succeeded += 1;
        break;
      case "failed":
        counts.failed += 1;
        break;
      case "cancelled":
        counts.cancelled += 1;
        break;
      case "running":
        counts.running += 1;
        break;
      case "ready":
        counts.ready += 1;
        break;
      case "pending":
        counts.pending += 1;
        break;
      case "blocked":
        counts.blocked += 1;
        break;
      default:
        break;
    }
  }
  return counts;
}

export function buildRunMetrics(
  run: { created_at: string; updated_at: string },
  tasks: Array<{ state: string }>,
): WorkflowRunMetrics {
  const taskCounts = countTasksByState(tasks);
  const started = new Date(run.created_at).getTime();
  const ended = new Date(run.updated_at).getTime();
  const durationMs =
    Number.isFinite(started) && Number.isFinite(ended) ? Math.max(0, ended - started) : null;
  const done = taskCounts.succeeded + taskCounts.failed + taskCounts.cancelled;
  const wavesEstimate =
    taskCounts.total > 0 ? Math.max(1, Math.ceil(done / Math.max(1, taskCounts.succeeded || 1))) : null;

  return { taskCounts, durationMs, wavesEstimate };
}

/** A4: métricas del run + cupo activo del usuario. */
export async function getWorkflowMetricsBundle(
  workflowRunId: string,
  userId: string,
  run: { created_at: string; updated_at: string; pipeline_run_id?: string | null },
  tasks: Array<{ state: string }>,
) {
  const runMetrics = buildRunMetrics(run, tasks);
  const activeWorkflows = await countActiveWorkflowsForUser(userId);
  const maxActiveWorkflows = getMaxActiveWorkflowsPerUser();

  return {
    run: runMetrics,
    quota: { active: activeWorkflows, max: maxActiveWorkflows },
    pipelineRunId: run.pipeline_run_id ?? null,
  };
}

/** Runs recientes del proyecto (panel / debug). */
export async function listProjectWorkflowRuns(
  projectId: string,
  userId: string,
  limit = 8,
) {
  const { data: runs } = await supabaseAdmin
    .from("gafcore_workflow_runs")
    .select("id, state, instruction, created_at, updated_at, pipeline_run_id")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!runs?.length) return [];

  const ids = runs.map((r) => r.id);
  const { data: tasks } = await supabaseAdmin
    .from("gafcore_agent_tasks")
    .select("workflow_run_id, state")
    .in("workflow_run_id", ids);

  const byRun = new Map<string, Array<{ state: string }>>();
  for (const t of tasks ?? []) {
    const list = byRun.get(t.workflow_run_id) ?? [];
    list.push({ state: t.state });
    byRun.set(t.workflow_run_id, list);
  }

  return runs.map((r) => ({
    id: r.id,
    state: r.state,
    instruction: r.instruction.slice(0, 120),
    pipelineRunId: r.pipeline_run_id,
    createdAt: r.created_at,
    metrics: buildRunMetrics(r, byRun.get(r.id) ?? []),
  }));
}
