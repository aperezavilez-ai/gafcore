import type { SupabaseClient } from "@supabase/supabase-js";
import {
  solutionHintFromIssues,
  validationFingerprint,
} from "@/lib/gafcore-ai-memory.shared";
import type { ProjectValidationIssue } from "@/lib/gafcore-ai-validation.shared";
import { persistValidationRun } from "@/lib/gafcore-validation.server";
import { runValidationWithAutofix } from "@/validation/runner";
import { pipelineIsSuccess } from "@/orchestrator/gafcore-build-pipeline.shared";
import { orchestratorShouldRetry } from "@/orchestrator/error.policy";
import {
  appendRunStep,
  getPipelineRunForUser,
  updatePipelineRun,
} from "@/lib/gafcore-orchestrator.server";
import type { PipelineFileSnapshot } from "@/orchestrator/types";
import type { ValidationReport } from "@/validation/types";

async function persistMemoryForIssues(
  sb: SupabaseClient,
  projectId: string,
  userId: string,
  issues: ProjectValidationIssue[],
  resolved: boolean,
): Promise<void> {
  const slice = issues.slice(0, 12);
  for (const issue of slice) {
    const fp = validationFingerprint(issue);
    if (resolved) {
      const hint = solutionHintFromIssues([issue]);
      await sb.from("project_ai_memory").upsert(
        {
          project_id: projectId,
          user_id: userId,
          kind: "solution",
          fingerprint: fp,
          message: issue.message.slice(0, 500),
          solution_hint: hint.slice(0, 800),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "project_id,kind,fingerprint" },
      );
    } else if (issue.severity === "error") {
      const { data: existing } = await sb
        .from("project_ai_memory")
        .select("hit_count")
        .eq("project_id", projectId)
        .eq("kind", "error")
        .eq("fingerprint", fp)
        .maybeSingle();
      await sb.from("project_ai_memory").upsert(
        {
          project_id: projectId,
          user_id: userId,
          kind: "error",
          fingerprint: fp,
          message: issue.message.slice(0, 500),
          solution_hint: null,
          hit_count: (existing?.hit_count ?? 0) + 1,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "project_id,kind,fingerprint" },
      );
    }
  }
}

export async function finalizePipelineValidation(
  sb: SupabaseClient,
  runId: string,
  userId: string,
  files: PipelineFileSnapshot[],
): Promise<{
  ok: boolean;
  issues: ProjectValidationIssue[];
  shouldRetry: boolean;
  success: boolean;
  validationReport: ValidationReport | null;
  patchedFiles: PipelineFileSnapshot[];
  fixesApplied: string[];
  run: Awaited<ReturnType<typeof getPipelineRunForUser>>;
}> {
  const run = await getPipelineRunForUser(sb, runId, userId);
  if (!run) {
    return {
      ok: false,
      issues: [],
      shouldRetry: false,
      success: false,
      validationReport: null,
      patchedFiles: [],
      fixesApplied: [],
      run: null,
    };
  }
  if (run.state === "completed" || run.state === "failed" || run.state === "cancelled") {
    return {
      ok: false,
      issues: [],
      shouldRetry: false,
      success: false,
      validationReport: null,
      patchedFiles: [],
      fixesApplied: [],
      run,
    };
  }

  let current = await appendRunStep(sb, run, "validate", "validating");
  if (!current) {
    return {
      ok: false,
      issues: [],
      shouldRetry: false,
      success: false,
      validationReport: null,
      patchedFiles: [],
      fixesApplied: [],
      run,
    };
  }

  const payload = files.slice(0, 40).map((f) => ({ name: f.name, content: f.content }));
  const { report: validationReport, files: patchedFiles, fixesApplied } = await runValidationWithAutofix({
    files: payload,
    phase: "post_generate",
    projectId: current.project_id,
    userId,
    pipelineRunId: runId,
  });
  const issues = validationReport.issues;
  const success = validationReport.approved && pipelineIsSuccess(issues);
  const shouldRetry = orchestratorShouldRetry(issues, current.retry_count);

  try {
    await persistValidationRun(sb, {
      projectId: current.project_id,
      userId,
      pipelineRunId: runId,
      phase: "post_generate",
      report: {
        ...validationReport,
        logs: [
          ...validationReport.logs,
          ...(fixesApplied.length > 0
            ? [
                {
                  at: new Date().toISOString(),
                  event: "validation.autofix.summary",
                  meta: { fixesApplied },
                },
              ]
            : []),
        ],
      },
    });
  } catch (e) {
    console.error("[orchestrator] validation persist:", e);
  }

  current =
    (await appendRunStep(sb, current, "memory", "persisting_memory", {
      issueCount: issues.length,
    })) ?? current;

  const errorIssues = issues.filter((i) => i.severity === "error");
  try {
    await persistMemoryForIssues(sb, current.project_id, userId, errorIssues, success);
  } catch (e) {
    console.error("[orchestrator] memory:", e);
  }

  const terminalState = success ? "completed" : shouldRetry ? "retrying" : "failed";
  const updated = await updatePipelineRun(sb, runId, userId, {
    state: terminalState,
    current_step: success ? "memory" : shouldRetry ? "retry" : "validate",
    payload_json: {
      ...current.payload_json,
      lastValidation: {
        issues,
        success,
        overallScore: validationReport.overallScore,
        status: validationReport.status,
        fixesApplied,
        at: new Date().toISOString(),
      },
    },
    error_code: success ? null : shouldRetry ? null : "VALIDATION_FAILED",
    error_message: success
      ? null
      : issues[0]?.message?.slice(0, 500) ?? "Validación con errores bloqueantes",
    retry_count: shouldRetry ? current.retry_count + 1 : current.retry_count,
    events_json: current.events_json,
  });

  return {
    ok: true,
    issues,
    shouldRetry,
    success,
    validationReport,
    patchedFiles: patchedFiles.map((f) => ({
      name: f.name,
      content: f.content,
      language: files.find((x) => x.name === f.name)?.language,
    })),
    fixesApplied,
    run: updated,
  };
}
