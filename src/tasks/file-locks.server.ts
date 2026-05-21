import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { FilePatch } from "@/tasks/artifacts.shared";
import { AGENT_REGISTRY } from "@/agents/registry.shared";
import type { AgentTaskRow, AgentType } from "@/tasks/types";

function isWriterAgentType(agentType: string): boolean {
  return Boolean(AGENT_REGISTRY[agentType as AgentType]?.canWriteFiles);
}

export function normalizeProjectPath(name: string): string {
  return name.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function pathsFromPatches(patches: FilePatch[]): string[] {
  return [...new Set(patches.map((p) => normalizeProjectPath(p.name)))];
}

export function pathsFromFileScope(scope: { allow?: string[]; deny?: string[] }): string[] {
  const allow = scope.allow ?? [];
  return allow.map((p) => normalizeProjectPath(p.replace(/\*\*/g, "").replace(/\*/g, ""))).filter(Boolean);
}

export async function getActiveLocksForWorkflow(
  workflowRunId: string,
  excludeTaskId?: string,
): Promise<Map<string, string>> {
  const { data: rows } = await supabaseAdmin
    .from("gafcore_agent_tasks")
    .select("id, file_locks, state")
    .eq("workflow_run_id", workflowRunId)
    .eq("state", "running");

  const locks = new Map<string, string>();
  for (const row of rows ?? []) {
    if (excludeTaskId && row.id === excludeTaskId) continue;
    for (const path of row.file_locks ?? []) {
      const n = normalizeProjectPath(path);
      if (n) locks.set(n, row.id);
    }
  }
  return locks;
}

function pathsConflict(task: AgentTaskRow, activeLocks: Map<string, string>): boolean {
  if (!isWriterAgentType(task.agent_type)) return false;
  const scope = (task.file_scope ?? {}) as { allow?: string[] };
  const candidates = pathsFromFileScope(scope);
  if (candidates.length === 0) return false;
  for (const c of candidates) {
    for (const locked of activeLocks.keys()) {
      if (locked.startsWith(c) || c.startsWith(locked)) return true;
    }
  }
  return false;
}

/** Evita dos escritores con scope solapado en la misma ola. */
export function filterTasksByFileLocks(
  claimed: AgentTaskRow[],
  activeLocks: Map<string, string>,
): { toRun: AgentTaskRow[]; deferred: AgentTaskRow[] } {
  const toRun: AgentTaskRow[] = [];
  const deferred: AgentTaskRow[] = [];
  for (const t of claimed) {
    if (pathsConflict(t, activeLocks)) deferred.push(t);
    else toRun.push(t);
  }
  return { toRun, deferred };
}

export async function setTaskFileLocks(taskId: string, paths: string[]): Promise<void> {
  const unique = [...new Set(paths.map(normalizeProjectPath))].filter(Boolean);
  await supabaseAdmin
    .from("gafcore_agent_tasks")
    .update({ file_locks: unique, updated_at: new Date().toISOString() })
    .eq("id", taskId);
}

export async function clearTaskFileLocks(taskId: string): Promise<void> {
  await supabaseAdmin
    .from("gafcore_agent_tasks")
    .update({ file_locks: [], updated_at: new Date().toISOString() })
    .eq("id", taskId);
}
