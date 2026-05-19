import type { SupabaseClient } from "@supabase/supabase-js";
import type { ValidationReport } from "@/validation/types";

export async function persistValidationRun(
  sb: SupabaseClient,
  input: {
    projectId: string;
    userId: string;
    pipelineRunId?: string;
    phase: "post_generate" | "pre_deploy" | "manual";
    report: ValidationReport;
  },
): Promise<{ id: string | null }> {
  const { report } = input;
  const { data, error } = await sb
    .from("gafcore_validation_runs")
    .insert({
      pipeline_run_id: input.pipelineRunId ?? null,
      project_id: input.projectId,
      user_id: input.userId,
      phase: input.phase,
      status: report.status,
      overall_score: report.overallScore,
      dimensions_json: report.dimensions,
      issues_json: report.issues,
      fixes_json: [],
      logs_json: report.logs,
      approved: report.approved,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[validation] persist run:", error);
    return { id: null };
  }
  return { id: data?.id as string };
}

export async function getLatestValidationRun(
  sb: SupabaseClient,
  projectId: string,
  userId: string,
) {
  const { data, error } = await sb
    .from("gafcore_validation_runs")
    .select(
      "id, status, overall_score, dimensions_json, issues_json, approved, created_at, phase",
    )
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[validation] load latest:", error);
    return null;
  }
  return data;
}
