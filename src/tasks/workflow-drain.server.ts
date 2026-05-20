import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ProjFile } from "@/lib/gafcore-chat.shared";
import { runWorkflowParallelWave } from "@/tasks/workflow-run.server";
import { loadWorkflowProjectFiles } from "@/tasks/workflow-files.server";

export type WorkflowDrainResult = {
  ok: boolean;
  processed: number;
  workflows: Array<{ workflowRunId: string; claimed: number; workflowState: string }>;
};

function drainAuthorized(request: Request): boolean {
  const secret =
    process.env.CRON_SECRET?.trim() ||
    process.env.GAFCORE_CRON_SECRET?.trim() ||
    process.env.VERCEL_CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("x-cron-secret") ?? request.headers.get("authorization");
  if (!header) return false;
  if (header === secret) return true;
  if (header === `Bearer ${secret}`) return true;
  return false;
}

/** B2: procesa una ola de workflows en estado executing (cron / worker). */
export async function drainWorkflowQueue(request: Request): Promise<WorkflowDrainResult> {
  if (!drainAuthorized(request)) {
    return { ok: false, processed: 0, workflows: [] };
  }

  let body: { workflowRunId?: string; limit?: number } = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text) as typeof body;
  } catch {
    /* empty body ok */
  }

  const limit = Math.min(body.limit ?? 5, 10);
  const workflows: WorkflowDrainResult["workflows"] = [];

  if (body.workflowRunId) {
    const { data: run } = await supabaseAdmin
      .from("gafcore_workflow_runs")
      .select("id, project_id, user_id, instruction")
      .eq("id", body.workflowRunId)
      .maybeSingle();

    if (run) {
      const files = await loadWorkflowProjectFiles(run.id);
      const wave = await runWorkflowParallelWave({
        workflowRunId: run.id,
        projectId: run.project_id,
        userId: run.user_id,
        files,
      });
      workflows.push({
        workflowRunId: run.id,
        claimed: wave.claimed,
        workflowState: wave.workflowState,
      });
    }
    return { ok: true, processed: workflows.length, workflows };
  }

  const { data: runs } = await supabaseAdmin
    .from("gafcore_workflow_runs")
    .select("id, project_id, user_id")
    .eq("state", "executing")
    .order("updated_at", { ascending: true })
    .limit(limit);

  for (const run of runs ?? []) {
    const files = await loadWorkflowProjectFiles(run.id);
    const wave = await runWorkflowParallelWave({
      workflowRunId: run.id,
      projectId: run.project_id,
      userId: run.user_id,
      files,
    });
    workflows.push({
      workflowRunId: run.id,
      claimed: wave.claimed,
      workflowState: wave.workflowState,
    });
  }

  return { ok: true, processed: workflows.length, workflows };
}
