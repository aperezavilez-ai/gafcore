/**
 * Orquestador Modo Fábrica — pipeline + workflow + validación + build smoke + crítica + deploy opcional.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyUserIntent } from "@/orchestrator/intent.classifier";
import {
  buildFactoryInstructionWithProfile,
  resolveFactoryTemplateProfile,
} from "@/lib/gafcore-factory-templates.shared";
import { verifyFactoryDeploySite } from "@/lib/gafcore-factory-deploy-verify.server";
import { pipelineIsSuccess } from "@/orchestrator/gafcore-build-pipeline.shared";
import {
  assertProjectOwned,
  appendRunStep,
  createPipelineRun,
  updatePipelineRun,
} from "@/lib/gafcore-orchestrator.server";
import { finalizePipelineValidation } from "@/lib/gafcore-orchestrator-pipeline.server";
import { performDesignCritique } from "@/lib/gafcore-design-critique-run.server";
import { runFactoryBuildSmoke } from "@/lib/gafcore-factory-build-smoke.server";
import { FactoryPhaseTimer, recordFactoryRunMetrics } from "@/lib/gafcore-factory-metrics.server";
import { publishProjectOnServer } from "@/lib/github-publish.server";
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
  projectName?: string;
  instruction: string;
  files: ProjFile[];
  runDesignCritique?: boolean;
  autoDeploy?: boolean;
};

async function resolveProjectName(
  sb: SupabaseClient,
  projectId: string,
  fallback?: string,
): Promise<string> {
  if (fallback?.trim()) return fallback.trim();
  const { data } = await sb.from("projects").select("name").eq("id", projectId).maybeSingle();
  return (data?.name as string | undefined)?.trim() || "gafcore-project";
}

export async function executeGafcoreFactoryRun(
  input: ExecuteFactoryInput,
): Promise<FactoryRunResult> {
  const timer = new FactoryPhaseTimer();
  const owned = await assertProjectOwned(input.sb, input.projectId, input.userId);
  if (!owned) {
    return { ok: false, error: "project_not_found" };
  }

  const profile = resolveFactoryTemplateProfile(input.instruction);
  const withProfile = buildFactoryInstructionWithProfile(input.instruction, profile);
  const factoryInstruction = instructionIncludesFactoryPrefix(withProfile)
    ? withProfile
    : `${FACTORY_BUILD_PREFIX}${withProfile}`;

  const intent = classifyUserIntent(factoryInstruction, { mode: "build" });
  const suggestedTemplateSlug = profile.templateSlug;

  const pipelineRun = await createPipelineRun(input.sb, {
    projectId: input.projectId,
    userId: input.userId,
    instruction: factoryInstruction,
    intent,
    suggestedTemplateSlug,
  });

  if (!pipelineRun) {
    timer.mark("planning", false, "pipeline_failed");
    return { ok: false, error: "pipeline_failed", message: "No se pudo iniciar el pipeline." };
  }

  await updatePipelineRun(input.sb, pipelineRun.id, input.userId, {
    payload_json: {
      suggestedTemplateSlug,
      factoryProfileId: profile.id,
      factoryProfileLabel: profile.label,
    },
  });

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
    timer.mark("planning", true, planSummary.slice(0, 120));
  } catch (e) {
    const code = (e as Error & { code?: string })?.code;
    timer.mark("planning", false, code);
    await recordFactoryRunMetrics(
      input.sb,
      pipelineRun.id,
      input.userId,
      timer.finish(false),
    );
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

  let pipelineRow = pipelineRun;
  pipelineRow = (await appendRunStep(input.sb, pipelineRow, "generate", "generating")) ?? pipelineRow;

  const batch = await runWorkflowBatch({
    workflowRunId,
    projectId: input.projectId,
    userId: input.userId,
    files: input.files,
    maxSteps: GAFCORE_FACTORY_MAX_WAVES,
  });

  timer.mark(
    "generating",
    batch.workflowState !== "failed",
    `${batch.waves} ola(s), ${batch.mergedPatches.length} archivos`,
  );

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
    await recordFactoryRunMetrics(
      input.sb,
      pipelineRun.id,
      input.userId,
      timer.finish(false),
    );
    return {
      ok: false,
      error: "workflow_empty",
      message: "No se generaron archivos. Reformula la idea o inténtalo de nuevo.",
    };
  }

  pipelineRow =
    (await appendRunStep(input.sb, pipelineRow, "validate", "validating")) ?? pipelineRow;

  const validation = await finalizePipelineValidation(
    input.sb,
    pipelineRun.id,
    input.userId,
    mergedFiles.map((f) => ({ name: f.name, content: f.content, language: f.language })),
  );

  const overallScore = validation.validationReport?.overallScore ?? 0;
  const validationStatus = validation.validationReport?.status ?? "failed";
  let success = validation.success && pipelineIsSuccess(validation.issues);

  timer.mark("validating", success, `${overallScore}/100 · ${validationStatus}`);

  let outputFiles: FactoryFileOut[] = validation.patchedFiles?.length
    ? validation.patchedFiles.map((f) => ({
        name: f.name,
        content: f.content,
        language: f.language,
      }))
    : mergedFiles;

  pipelineRow =
    (await appendRunStep(input.sb, pipelineRow, "build_smoke", success ? "validating" : "failed")) ??
    pipelineRow;

  const buildSmoke = await runFactoryBuildSmoke(outputFiles);
  timer.mark("build_smoke", buildSmoke.ok, buildSmoke.message);

  if (!buildSmoke.ok) {
    success = false;
    await recordFactoryRunMetrics(
      input.sb,
      pipelineRun.id,
      input.userId,
      timer.finish(false, {
        validationScore: overallScore,
        buildSmokeOk: false,
      }),
    );
    return {
      ok: false,
      error: "build_smoke_failed",
      message: buildSmoke.message,
    };
  }

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
  if (runCritique && success && overallScore < GAFCORE_FACTORY_CRITIQUE_THRESHOLD) {
    pipelineRow =
      (await appendRunStep(input.sb, pipelineRow, "design_critique", "validating")) ?? pipelineRow;
    const critiqueRes = await performDesignCritique({
      userId: input.userId,
      projectId: input.projectId,
      files: outputFiles,
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
      timer.mark(
        "design_critique",
        true,
        `score ${critiqueRes.critique.score}, ${critiqueRes.critique.issues.length} issues`,
      );
    } else {
      critiqueMeta = {
        score: overallScore,
        issuesCount: 0,
        skipped: true,
        reason: critiqueRes.error,
      };
      timer.mark("design_critique", false, critiqueRes.error);
    }
  } else if (runCritique) {
    timer.mark("design_critique", true, "omitido (score alto o validación fallida)");
  }

  let deployMeta: {
    attempted: boolean;
    ok: boolean;
    message: string;
    siteHost?: string;
  } = { attempted: false, ok: false, message: "" };

  if (input.autoDeploy && success && buildSmoke.ok) {
    pipelineRow = (await appendRunStep(input.sb, pipelineRow, "deploy", "generating")) ?? pipelineRow;
    deployMeta.attempted = true;
    const projectName = await resolveProjectName(
      input.sb,
      input.projectId,
      input.projectName,
    );
    const deploy = await publishProjectOnServer({
      userId: input.userId,
      projectId: input.projectId,
      projectName,
      files: outputFiles.map((f) => ({
        name: f.name,
        language: f.language ?? "typescript",
        content: f.content,
      })),
    });
    deployMeta.ok = deploy.ok;
    deployMeta.message = deploy.message;
    deployMeta.siteHost = deploy.siteHost;
    timer.mark("deploy", deploy.ok, deploy.message.slice(0, 120));
    if (deploy.ok && deploy.siteHost) {
      const e2e = await verifyFactoryDeploySite(deploy.siteHost);
      timer.mark("deploy_e2e", e2e.ok, e2e.message.slice(0, 120));
      deployMeta.message = `${deploy.message} · ${e2e.message}`;
      if (!e2e.ok) {
        deployMeta.ok = false;
        success = false;
      }
    }
    if (!deploy.ok) {
      success = false;
    }
  }

  const stepLines = batch.steps
    .filter((s) => s.task)
    .map((s) => {
      const label = agentTypeLabel(s.task!.agent_type);
      const status = s.error ? `❌ ${s.error}` : "✓";
      return `- **${label}** · ${s.task!.title} ${status}`;
    });

  const deployLine = deployMeta.attempted
    ? deployMeta.ok
      ? `\n\n**Deploy:** en vivo${deployMeta.siteHost ? ` · ${deployMeta.siteHost}` : ""}.`
      : `\n\n**Deploy:** no completado — ${deployMeta.message}`
    : "";

  const reply =
    stepLines.length > 0
      ? `**Fábrica ${batch.workflowState}** (${batch.waves} ola(s)). Validación ${overallScore}/100. ${buildSmoke.message}${deployLine}\n\n${stepLines.join("\n")}`
      : `**Fábrica ${batch.workflowState}**. Validación ${overallScore}/100. ${buildSmoke.message}${deployLine}`;

  await recordFactoryRunMetrics(
    input.sb,
    pipelineRun.id,
    input.userId,
    timer.finish(success && (!deployMeta.attempted || deployMeta.ok), {
      validationScore: overallScore,
      buildSmokeOk: buildSmoke.ok,
      deployOk: deployMeta.attempted ? deployMeta.ok : undefined,
      deployHost: deployMeta.siteHost,
    }),
  );

  if (deployMeta.attempted && !deployMeta.ok) {
    return {
      ok: false,
      error: "deploy_failed",
      message: deployMeta.message,
    };
  }

  return {
    ok: true,
    phase: success ? "completed" : "failed",
    pipelineRunId: pipelineRun.id,
    workflowRunId,
    planSummary,
    workflowState: batch.workflowState,
    waves: batch.waves,
    files: outputFiles,
    validation: {
      success,
      overallScore,
      status: validationStatus,
      issuesCount: validation.issues.length,
    },
    buildSmoke: {
      ok: buildSmoke.ok,
      message: buildSmoke.message,
      entryFiles: buildSmoke.entryFiles,
    },
    critique: critiqueMeta,
    deploy: deployMeta.attempted ? deployMeta : undefined,
    templateProfile: {
      id: profile.id,
      label: profile.label,
      slug: profile.templateSlug,
    },
    reply,
  };
}

function instructionIncludesFactoryPrefix(instruction: string): boolean {
  return /\[modo fábrica/i.test(instruction);
}
