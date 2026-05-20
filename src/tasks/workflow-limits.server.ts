import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ACTIVE_STATES = ["planning", "executing"] as const;

export function getMaxActiveWorkflowsPerUser(): number {
  const raw = process.env.GAFCORE_WORKFLOW_MAX_ACTIVE_PER_USER?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 2;
  if (!Number.isFinite(n) || n < 1) return 2;
  return Math.min(n, 10);
}

export async function countActiveWorkflowsForUser(userId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("gafcore_workflow_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("state", [...ACTIVE_STATES]);

  if (error) {
    console.error("[workflow] count active:", error.message);
    return 0;
  }
  return count ?? 0;
}

export type WorkflowLimitCheck =
  | { allowed: true; active: number; max: number }
  | { allowed: false; active: number; max: number; error: "workflow_limit_reached" };

export async function checkWorkflowStartLimit(userId: string): Promise<WorkflowLimitCheck> {
  const max = getMaxActiveWorkflowsPerUser();
  const active = await countActiveWorkflowsForUser(userId);
  if (active >= max) {
    return { allowed: false, active, max, error: "workflow_limit_reached" };
  }
  return { allowed: true, active, max };
}
