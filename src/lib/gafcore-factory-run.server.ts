/**
 * Orquestador Modo Fábrica v1 — pipeline + workflow + validación + crítica de diseño.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyUserIntent } from "@/orchestrator/intent.classifier";
import { selectTemplateSlug } from "@/orchestrator/template.selector";
import { pipelineIsSuccess } from "@/orchestrator/gafcore-build-pipeline.shared";
import {
  assertProjectOwned,
  createPipelineRun,
} from "@/lib/gafcore-orchestrator.server";
import { finalizePipelineValidation } from "@/lib/gafcore-orchestrator-pipeline.server";
import { performDesignCritique } from "@/lib/gafcore-design-critique-run.server";
import {
  FACTORY_BUILD_PREFIX,
  GAFCORE_FACTORY_CRITIQUE_THRESHOLD,
  GAFCORE_FACTORY_MAX_WAVES,
  type FactoryFileOut,
  type FactoryRunResult,
} from "@/lib/gafcore-factory.shared";
import type { ProjFile } from "@/lib/gafcore-chat.shared";
import { planAndCreateWorkflow, runWorkflowBatch } from "@/tasks/workflow-run.server";
import { syncPipelineWithWorkflow } from "@/tasks/workflow-pipeline-bridge.server";
import { agentTypeLabel } from "@/tasks/artifacts.shared";

export type ExecuteFactoryInput = {
  sb: SupabaseClient;
  userId: string;
  projectId: string;
  instruction: string;
  files: ProjFile[];
  runDesignCritique?: boolean;
};

export async function executeGafcoreFactoryRun(
  input: ExecuteFactoryInput,
): Promise<FactoryRunResult> {
  const owned = await assertProjectOwned(input.sb, input.projectId, input.userId);
  if (!owned) {
    return { ok: false, error: "project_not_found" };
  }

  const factoryInstruction = instructionIncludesFactoryPrefix(input.instruction)
    ? input.instruction
    : `${FACTORY_BUILD_PREFIX}${input.instruction}`;

  const intent = classifyUserIntent(factoryInstruction, { mode: "build" });
  const suggestedTemplateSlug = selectTemplateSlug(intent);

  const pipelineRun = await createPipelineRun(input.sb, {
    projectId: input.projectId,
    userId: input.userId,
    instruction: factoryInstruction,
    intent,
    suggestedTemplateSlug,
  });

  if (!pipelineRun) {
    return { ok: false, error: "pipeline_failed", message: "No se pudo iniciar el pipeline." };
  }

  let workflowRunId: string;
  let planSummary: string;

  try {
    const started = await planAndCreateWorkflow(
      input.projectId,
      input.userId,
      factoryInstruction,
      input.files,
      pipelineRun.id,
    );
    workflowRunId = started.workflowRunId;
    planSummary = started.planSummary;
  } catch (e) {
    const code = (e as Error & { code?: string })?.code;
    if (code === "workflow_limit_reached") {
      return {
        ok: false,
        error: "workflow_limit_reached",
        active: (e as Error & { active?: number }).active,
        max: (e as Error & { max?: number }).max,
      };
    }
    return { ok: false, error: "plan_failed", message: String((e as Error)?.message ?? e) };
  }

  await syncPipelineWithWorkflow(input.sb, pipelineRun.id, input.userId, {
    workflowRunId,
    workflowState: "executing",
    planSummary,
  });

  const batch = await runWorkflowBatch({
    workflowRunId,
    projectId: input.projectId,
    userId: input.userId,
    files: input.files,
    maxSteps: GAFCORE_FACTORY_MAX_WAVES,
  });

  await syncPipelineWithWorkflow(input.sb, pipelineRun.id, input.userId, {
    workflowRunId,
    workflowState: batch.workflowState,
    planSummary,
  });

  const mergedFiles: FactoryFileOut[] =
    batch.mergedPatches.length > 0
      ? batch.mergedPatches.map((p) => ({
          name: p.name,
          content: p.content,
          language: p.language,
        }))
      : input.files.map((f) => ({ name: f.name, content: f.content, language: f.language }));

  if (mergedFiles.length === 0) {
    return {
      ok: false,
      error: "workflow_empty",
      message: "No se generaron archivos. Reformula la idea o inténtalo de nuevo.",
    };
  }

  const validation = await finalizePipelineValidation(
    input.sb,
    pipelineRun.id,
    input.userId,
    mergedFiles.map((f) => ({ name: f.name, content: f.content, language: f.language })),
  );

  const overallScore = validation.validationReport?.overallScore ?? 0;
  const validationStatus = validation.validationReport?.status ?? "failed";
  const success = validation.success && pipelineIsSuccess(validation.issues);

  let critiqueMeta:
    | {
        score: number;
        issuesCount: number;
        followupInstruction?: string;
        skipped?: boolean;
        reason?: string;
      }
    | undefined;

  const runCritique = input.runDesignCritique !== false;
  if (
    runCritique &&
    success &&
    overallScore < GAFCORE_FACTORY_CRITIQUE_THRESHOLD &&
    mergedFiles.length > 0
  ) {
    const critiqueRes = await performDesignCritique({
      userId: input.userId,
      projectId: input.projectId,
      files: mergedFiles,
      brief: "Modo fábrica: prioriza correcciones visuales de alto impacto.",
    });
    if (critiqueRes.ok) {
      critiqueMeta = {
        score: critiqueRes.critique.score,
        issuesCount: critiqueRes.critique.issues.length,
        followupInstruction:
          critiqueRes.critique.issues.length > 0
            ? critiqueRes.critique.followupInstruction
            : undefined,
      };
    } else {
      critiqueMeta = {
        score: overallScore,
        issuesCount: 0,
        skipped: true,
        reason: critiqueRes.error,
      };
    }
  }

  const stepLines = batch.steps
    .filter((s) => s.task)
    .map((s) => {
      const label = agentTypeLabel(s.task!.agent_type);
      const status = s.error ? `❌ ${s.error}` : "✓";
      return `- **${label}** · ${s.task!.title} ${status}`;
    });

  const reply =
    stepLines.length > 0
      ? `**Fábrica ${batch.workflowState}** (${batch.waves} ola(s)). Validación ${overallScore}/100.\n\n${stepLines.join("\n")}`
      : `**Fábrica ${batch.workflowState}**. Validación ${overallScore}/100.`;

  return {
    ok: true,
    phase: success ? "completed" : "failed",
    pipelineRunId: pipelineRun.id,
    workflowRunId,
    planSummary,
    workflowState: batch.workflowState,
    waves: batch.waves,
    files: validation.patchedFiles?.length
      ? validation.patchedFiles.map((f) => ({
          name: f.name,
          content: f.content,
          language: f.language,
        }))
      : mergedFiles,
    validation: {
      success,
      overallScore,
      status: validationStatus,
      issuesCount: validation.issues.length,
    },
    critique: critiqueMeta,
    reply,
  };
}

function instructionIncludesFactoryPrefix(instruction: string): boolean {
  return /\[modo fábrica/i.test(instruction);
}
