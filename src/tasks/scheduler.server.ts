import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { TaskPlan } from "@/tasks/artifacts.shared";
import { AGENT_REGISTRY } from "@/agents/registry.shared";
import type { AgentTaskRow, TaskState } from "@/tasks/types";

const LEASE_MS = 5 * 60 * 1000;

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

/** Reclama la siguiente tarea ready (1 por proyecto en v1). */
export async function claimNextReadyTask(
  projectId: string,
  userId: string,
): Promise<AgentTaskRow | null> {
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
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1);

  const row = ready?.[0] as AgentTaskRow | undefined;
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

export async function completeTask(
  taskId: string,
  outcome: "succeeded" | "failed",
  opts?: { errorCode?: string; errorMessage?: string; artifactIds?: string[] },
): Promise<void> {
  const state: TaskState = outcome === "succeeded" ? "succeeded" : "failed";
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
