import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { TaskPlan } from "@/tasks/artifacts.shared";
import { AGENT_REGISTRY } from "@/agents/registry.shared";
import type { AgentTaskRow, TaskState } from "@/tasks/types";
import {
  clearTaskFileLocks,
  filterTasksByFileLocks,
  getActiveLocksForWorkflow,
} from "@/tasks/file-locks.server";

const LEASE_MS = 5 * 60 * 1000;

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export function getWorkflowMaxParallel(): number {
  const raw = process.env.GAFCORE_WORKFLOW_MAX_PARALLEL?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 3;
  if (!Number.isFinite(n) || n < 1) return 3;
  return Math.min(n, 8);
}

export async function appendTaskLog(
  taskId: string,
  event: string,
  message: string,
  level: "info" | "warn" | "error" = "info",
  meta: Record<string, unknown> = {},
): Promise<void> {
  await supabaseAdmin.from("gafcore_agent_task_logs").insert({
    task_id: taskId,
    level,
    event,
    message,
    meta_json: meta,
  });
}

export async function releaseTaskToReady(taskId: string): Promise<void> {
  await supabaseAdmin
    .from("gafcore_agent_tasks")
    .update({
      state: "ready",
      lease_expires_at: null,
      started_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId)
    .eq("state", "running");
}

/** B0: claim atómico vía RPC (fallback a claim legacy si la función no existe). */
export async function claimReadyTasksForWorkflow(
  workflowRunId: string,
  userId: string,
  limit = getWorkflowMaxParallel(),
): Promise<AgentTaskRow[]> {
  const { data, error } = await supabaseAdmin.rpc("claim_gafcore_agent_tasks", {
    p_workflow_run_id: workflowRunId,
    p_user_id: userId,
    p_limit: limit,
    p_lease_seconds: Math.floor(LEASE_MS / 1000),
  });

  if (!error && Array.isArray(data) && data.length > 0) {
    for (const row of data) {
      await appendTaskLog(row.id, "claimed", "Tarea en ejecución (RPC)", "info", {
        worker: "parallel",
      });
    }
    return data as AgentTaskRow[];
  }

  if (error?.code !== "42883" && error?.message) {
    console.warn("[scheduler] claim RPC:", error.message);
  }

  const single = await claimNextReadyTaskForWorkflow(workflowRunId, userId);
  return single ? [single] : [];
}

async function claimNextReadyTaskForWorkflow(
  workflowRunId: string,
  userId: string,
): Promise<AgentTaskRow | null> {
  const { data: ready } = await supabaseAdmin
    .from("gafcore_agent_tasks")
    .select("*")
    .eq("workflow_run_id", workflowRunId)
    .eq("user_id", userId)
    .eq("state", "ready")
    .order("created_at", { ascending: true })
    .limit(16);

  const row = (ready ?? [])
    .sort(
      (a, b) =>
        (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9) ||
        String(a.created_at).localeCompare(String(b.created_at)),
    )[0] as AgentTaskRow | undefined;
  if (!row) return null;

  const lease = new Date(Date.now() + LEASE_MS).toISOString();
  const { data: claimed, error } = await supabaseAdmin
    .from("gafcore_agent_tasks")
    .update({
      state: "running",
      lease_expires_at: lease,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("state", "ready")
    .select("*")
    .maybeSingle();

  if (error || !claimed) return null;
  await appendTaskLog(row.id, "claimed", "Tarea en ejecución");
  return claimed as AgentTaskRow;
}

/** Materializa tareas desde un TaskPlan y enlaza dependencias. */
export async function seedTasksFromPlan(
  workflowRunId: string,
  projectId: string,
  userId: string,
  plan: TaskPlan,
): Promise<{ taskIds: Record<string, string> }> {
  const taskIds: Record<string, string> = {};

  for (const item of plan.tasks) {
    const cap = AGENT_REGISTRY[item.agentType];
    const { data, error } = await supabaseAdmin
      .from("gafcore_agent_tasks")
      .insert({
        workflow_run_id: workflowRunId,
        project_id: projectId,
        user_id: userId,
        agent_type: item.agentType,
        state: item.dependsOn.length > 0 ? "blocked" : "ready",
        priority: item.priority ?? cap.defaultPriority,
        title: item.title,
        instruction: item.instruction,
        file_scope: item.fileScope ?? {
          allow: cap.defaultAllow,
          deny: cap.defaultDeny,
        },
        max_retries: cap.maxRetries,
        idempotency_key: item.id,
      })
      .select("id")
      .single();

    if (error || !data) throw new Error(error?.message ?? "task_insert_failed");
    taskIds[item.id] = data.id;
    await appendTaskLog(data.id, "created", `Tarea ${item.title}`);
  }

  for (const item of plan.tasks) {
    const taskId = taskIds[item.id];
    if (!taskId) continue;
    for (const dep of item.dependsOn) {
      const depId = taskIds[dep];
      if (!depId) continue;
      await supabaseAdmin.from("gafcore_task_dependencies").insert({
        task_id: taskId,
        depends_on_task_id: depId,
      });
    }
  }

  return { taskIds };
}

/** Reclama una tarea ready del proyecto (legacy / drain sin workflow). */
export async function claimNextReadyTask(
  projectId: string,
  userId: string,
  workflowRunId?: string,
): Promise<AgentTaskRow | null> {
  if (workflowRunId) {
    const rows = await claimReadyTasksForWorkflow(workflowRunId, userId, 1);
    return rows[0] ?? null;
  }

  const { data: running } = await supabaseAdmin
    .from("gafcore_agent_tasks")
    .select("id")
    .eq("project_id", projectId)
    .eq("state", "running")
    .limit(1);

  if (running && running.length > 0) return null;

  const { data: ready } = await supabaseAdmin
    .from("gafcore_agent_tasks")
    .select("*")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .eq("state", "ready")
    .order("created_at", { ascending: true })
    .limit(16);

  const row = (ready ?? [])
    .sort(
      (a, b) =>
        (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9) ||
        String(a.created_at).localeCompare(String(b.created_at)),
    )[0] as AgentTaskRow | undefined;
  if (!row) return null;

  const lease = new Date(Date.now() + LEASE_MS).toISOString();
  const { data: claimed, error } = await supabaseAdmin
    .from("gafcore_agent_tasks")
    .update({
      state: "running",
      lease_expires_at: lease,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("state", "ready")
    .select("*")
    .maybeSingle();

  if (error || !claimed) return null;
  await appendTaskLog(row.id, "claimed", "Tarea en ejecución");
  return claimed as AgentTaskRow;
}

export function isWriterAgentType(agentType: string): boolean {
  return Boolean(AGENT_REGISTRY[agentType as keyof typeof AGENT_REGISTRY]?.canWriteFiles);
}

/** B1: de un lote reclamado, deja 1 escritor y el resto de escritores vuelven a ready. */
export function pickTasksForParallelWave(claimed: AgentTaskRow[]): {
  toRun: AgentTaskRow[];
  deferredWriters: AgentTaskRow[];
} {
  const writers: AgentTaskRow[] = [];
  const nonWriters: AgentTaskRow[] = [];
  for (const t of claimed) {
    if (isWriterAgentType(t.agent_type)) writers.push(t);
    else nonWriters.push(t);
  }
  const toRun: AgentTaskRow[] = [...nonWriters];
  if (writers.length > 0) {
    writers.sort(
      (a, b) =>
        (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9) ||
        String(a.created_at).localeCompare(String(b.created_at)),
    );
    toRun.push(writers[0]!);
  }
  return { toRun, deferredWriters: writers.slice(1) };
}

export async function completeTask(
  taskId: string,
  outcome: "succeeded" | "failed",
  opts?: { errorCode?: string; errorMessage?: string; artifactIds?: string[] },
): Promise<void> {
  const state: TaskState = outcome === "succeeded" ? "succeeded" : "failed";
  await clearTaskFileLocks(taskId);
  await supabaseAdmin
    .from("gafcore_agent_tasks")
    .update({
      state,
      finished_at: new Date().toISOString(),
      lease_expires_at: null,
      error_code: opts?.errorCode ?? null,
      error_message: opts?.errorMessage ?? null,
      output_artifact_ids: opts?.artifactIds ?? [],
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId);

  await appendTaskLog(taskId, outcome, outcome === "succeeded" ? "OK" : opts?.errorMessage ?? "falló");

  if (outcome === "succeeded") {
    await unblockDependents(taskId);
  }
}

async function unblockDependents(completedTaskId: string): Promise<void> {
  const { data: deps } = await supabaseAdmin
    .from("gafcore_task_dependencies")
    .select("task_id")
    .eq("depends_on_task_id", completedTaskId);

  for (const { task_id: taskId } of deps ?? []) {
    const { data: depRows } = await supabaseAdmin
      .from("gafcore_task_dependencies")
      .select("depends_on_task_id")
      .eq("task_id", taskId);

    const depIds = (depRows ?? []).map((r) => r.depends_on_task_id);
    if (depIds.length === 0) continue;

    const { data: depTasks } = await supabaseAdmin
      .from("gafcore_agent_tasks")
      .select("state")
      .in("id", depIds);

    const allDone = (depTasks ?? []).every((t) => t.state === "succeeded");
    if (allDone) {
      await supabaseAdmin
        .from("gafcore_agent_tasks")
        .update({ state: "ready", updated_at: new Date().toISOString() })
        .eq("id", taskId)
        .eq("state", "blocked");
    }
  }
}
