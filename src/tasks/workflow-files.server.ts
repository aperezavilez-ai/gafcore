import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ProjFile } from "@/lib/gafcore-chat.shared";
import type { FilePatch } from "@/tasks/artifacts.shared";

const MAX_SNAPSHOT_FILES = 80;
const MAX_CHARS_PER_FILE = 48_000;

export type WorkflowPayload = {
  version?: number;
  filesSnapshot?: ProjFile[];
  mergedPatches?: FilePatch[];
  planSummary?: string;
};

export function trimFilesForWorkflowSnapshot(files: ProjFile[]): ProjFile[] {
  return files.slice(0, MAX_SNAPSHOT_FILES).map((f) => ({
    name: f.name.replace(/\\/g, "/"),
    language: f.language,
    content:
      f.content.length > MAX_CHARS_PER_FILE
        ? `${f.content.slice(0, MAX_CHARS_PER_FILE)}\n/* …truncado para snapshot workflow… */\n`
        : f.content,
  }));
}

export function mergePatchesIntoFiles(base: ProjFile[], patches: FilePatch[]): ProjFile[] {
  const byName = new Map(base.map((f) => [f.name.replace(/\\/g, "/"), { ...f }]));
  for (const p of patches) {
    const name = p.name.replace(/\\/g, "/");
    const prev = byName.get(name);
    byName.set(name, {
      name,
      language: p.language ?? prev?.language,
      content: p.content,
    });
  }
  return [...byName.values()];
}

export async function loadWorkflowPayload(workflowRunId: string): Promise<WorkflowPayload> {
  const { data } = await supabaseAdmin
    .from("gafcore_workflow_runs")
    .select("payload_json")
    .eq("id", workflowRunId)
    .maybeSingle();
  const raw = data?.payload_json;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as WorkflowPayload;
}

export async function saveWorkflowPayload(
  workflowRunId: string,
  patch: Partial<WorkflowPayload>,
): Promise<void> {
  const current = await loadWorkflowPayload(workflowRunId);
  const next: WorkflowPayload = {
    version: 1,
    ...current,
    ...patch,
  };
  await supabaseAdmin
    .from("gafcore_workflow_runs")
    .update({ payload_json: next, updated_at: new Date().toISOString() })
    .eq("id", workflowRunId);
}

export async function persistWorkflowFilesSnapshot(
  workflowRunId: string,
  files: ProjFile[],
  planSummary?: string,
): Promise<ProjFile[]> {
  const snapshot = trimFilesForWorkflowSnapshot(files);
  await saveWorkflowPayload(workflowRunId, {
    filesSnapshot: snapshot,
    mergedPatches: [],
    planSummary,
  });
  return snapshot;
}

export async function loadWorkflowProjectFiles(workflowRunId: string): Promise<ProjFile[]> {
  const payload = await loadWorkflowPayload(workflowRunId);
  return payload.filesSnapshot ?? [];
}

/** Aplica parches de una ola y persiste snapshot actualizado (B3 + A3 merge). */
export async function applyWorkflowPatches(
  workflowRunId: string,
  patches: FilePatch[],
): Promise<ProjFile[]> {
  const payload = await loadWorkflowPayload(workflowRunId);
  const base = payload.filesSnapshot ?? [];
  const prevPatches = payload.mergedPatches ?? [];
  const allPatches = [...prevPatches, ...patches];
  const merged = mergePatchesIntoFiles(base, allPatches);
  await saveWorkflowPayload(workflowRunId, {
    filesSnapshot: merged,
    mergedPatches: allPatches,
  });
  return merged;
}
