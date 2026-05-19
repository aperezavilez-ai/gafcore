import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertProjectOwned } from "@/lib/gafcore-orchestrator.server";
import { getLatestValidationRun, persistValidationRun } from "@/lib/gafcore-validation.server";
import { runValidationWithAutofix } from "@/validation/runner";

const fileSchema = z.object({
  name: z.string().min(1).max(512),
  content: z.string().max(500_000),
  language: z.string().max(64).optional(),
});

const runSchema = z.object({
  projectId: z.string().uuid(),
  files: z.array(fileSchema).max(40),
  phase: z.enum(["post_generate", "pre_deploy", "manual"]).optional(),
  pipelineRunId: z.string().uuid().optional(),
});

export const runGafcoreProjectValidation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => runSchema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId!;
    const sb = context.supabase!;

    const owned = await assertProjectOwned(sb, data.projectId, userId);
    if (!owned) {
      return { ok: false as const, code: "PROJECT_NOT_FOUND" as const };
    }

    const phase = data.phase ?? "manual";
    const { report, files: patchedFiles, fixesApplied } = runValidationWithAutofix({
      files: data.files,
      phase,
      projectId: data.projectId,
      userId,
      pipelineRunId: data.pipelineRunId,
    });

    const persisted = await persistValidationRun(sb, {
      projectId: data.projectId,
      userId,
      pipelineRunId: data.pipelineRunId,
      phase,
      report,
    });

    return {
      ok: true as const,
      report: {
        id: persisted.id,
        status: report.status,
        approved: report.approved,
        overallScore: report.overallScore,
        dimensions: report.dimensions,
        issues: report.issues,
        blockingErrorCount: report.blockingErrorCount,
        warningCount: report.warningCount,
        fixesApplied,
      },
      patchedFiles,
    };
  });

export const getGafcoreProjectValidationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const row = await getLatestValidationRun(context.supabase!, data.projectId, context.userId!);
    if (!row) return { ok: true as const, run: null };
    return {
      ok: true as const,
      run: {
        id: row.id,
        status: row.status,
        overallScore: row.overall_score,
        approved: row.approved,
        dimensions: row.dimensions_json,
        issueCount: Array.isArray(row.issues_json) ? row.issues_json.length : 0,
        createdAt: row.created_at,
        phase: row.phase,
      },
    };
  });
