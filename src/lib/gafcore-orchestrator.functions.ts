import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { classifyUserIntent } from "@/orchestrator/intent.classifier";
import { selectTemplateSlug } from "@/orchestrator/template.selector";
import {
  assertProjectOwned,
  appendRunStep,
  createPipelineRun,
  getPipelineRunForUser,
} from "@/lib/gafcore-orchestrator.server";
import { finalizePipelineValidation } from "@/lib/gafcore-orchestrator-pipeline.server";
import type { GafcoreExtendedPipelineStep } from "@/orchestrator/gafcore-build-pipeline.shared";

const fileSchema = z.object({
  name: z.string().min(1).max(512),
  content: z.string().max(500_000),
  language: z.string().max(64).optional(),
});

const startSchema = z.object({
  projectId: z.string().uuid(),
  instruction: z.string().min(1).max(8000),
  mode: z.enum(["build", "chat"]).optional(),
  visualEdit: z.boolean().optional(),
});

export const startGafcorePipelineRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => startSchema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId!;
    const sb = context.supabase!;

    const owned = await assertProjectOwned(sb, data.projectId, userId);
    if (!owned) {
      return { ok: false as const, code: "PROJECT_NOT_FOUND" as const };
    }

    const intent = classifyUserIntent(data.instruction, {
      mode: data.mode,
      visualEdit: data.visualEdit,
    });
    const suggestedTemplateSlug = selectTemplateSlug(intent);

    const run = await createPipelineRun(sb, {
      projectId: data.projectId,
      userId,
      instruction: data.instruction,
      intent,
      suggestedTemplateSlug,
    });

    if (!run) {
      return { ok: false as const, code: "CREATE_FAILED" as const };
    }

    return {
      ok: true as const,
      runId: run.id,
      state: run.state,
      intent,
      suggestedTemplateSlug,
      events: run.events_json,
    };
  });

const advanceSchema = z.object({
  runId: z.string().uuid(),
  step: z.enum(["generate", "retry", "validate", "memory"]),
  state: z.enum([
    "generating",
    "retrying",
    "validating",
    "persisting_memory",
    "completed",
    "failed",
    "cancelled",
  ]),
  meta: z.record(z.unknown()).optional(),
});

export const advanceGafcorePipelineStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => advanceSchema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId!;
    const sb = context.supabase!;

    const run = await getPipelineRunForUser(sb, data.runId, userId);
    if (!run) return { ok: false as const, code: "RUN_NOT_FOUND" as const };
    if (run.state === "completed" || run.state === "failed" || run.state === "cancelled") {
      return { ok: false as const, code: "RUN_TERMINAL" as const };
    }

    const updated = await appendRunStep(
      sb,
      run,
      data.step as GafcoreExtendedPipelineStep,
      data.state,
      data.meta,
    );

    return {
      ok: true as const,
      run: updated
        ? {
            id: updated.id,
            state: updated.state,
            current_step: updated.current_step,
            events: updated.events_json,
          }
        : null,
    };
  });

const finalizeSchema = z.object({
  runId: z.string().uuid(),
  files: z.array(fileSchema).max(40),
});

export const finalizeGafcorePipelineRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => finalizeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId!;
    const sb = context.supabase!;

    const result = await finalizePipelineValidation(sb, data.runId, userId, data.files);

    if (!result.run) {
      return { ok: false as const, code: "RUN_NOT_FOUND" as const };
    }

    return {
      ok: result.ok,
      issues: result.issues,
      shouldRetry: result.shouldRetry,
      success: result.success,
      overallScore: result.validationReport?.overallScore ?? 0,
      validationStatus: result.validationReport?.status ?? "failed",
      approved: result.validationReport?.approved ?? false,
      patchedFiles: result.patchedFiles ?? [],
      fixesApplied: result.fixesApplied ?? [],
      run: {
        id: result.run.id,
        state: result.run.state,
        retry_count: result.run.retry_count,
        events: result.run.events_json,
      },
    };
  });

export const getGafcorePipelineRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ runId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const run = await getPipelineRunForUser(context.supabase!, data.runId, context.userId!);
    if (!run) return { ok: false as const, code: "RUN_NOT_FOUND" as const };
    return {
      ok: true as const,
      run: {
        id: run.id,
        project_id: run.project_id,
        state: run.state,
        current_step: run.current_step,
        intent: run.intent_json,
        payload_json: run.payload_json,
        events: run.events_json,
        error_code: run.error_code,
        error_message: run.error_message,
        retry_count: run.retry_count,
        updated_at: run.updated_at,
      },
    };
  });
