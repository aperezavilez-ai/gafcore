import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildProjectOrchestrationState,
  persistProjectOrchestrationState,
  verifyProjectDeploymentIntegrations,
} from "@/lib/gafcore-project-state.server";

const projectSchema = z.object({
  projectId: z.string().uuid(),
  workflowRunId: z.string().uuid().optional(),
});

export const getProjectOrchestrationState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => projectSchema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId!;
    const sb = context.supabase!;
    const { data: project } = await sb
      .from("projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!project) return { ok: false as const, error: "project_not_found" as const };

    const state = await buildProjectOrchestrationState(
      data.projectId,
      userId,
      data.workflowRunId ?? null,
    );
    return { ok: true as const, state };
  });

const syncSchema = projectSchema.extend({
  workflowRunId: z.string().uuid(),
  preview: z
    .object({
      ok: z.boolean(),
      lastError: z.string().nullable(),
    })
    .optional(),
});

export const syncProjectOrchestrationState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => syncSchema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId!;
    const sb = context.supabase!;
    const { data: project } = await sb
      .from("projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!project) return { ok: false as const, error: "project_not_found" as const };

    const state = await buildProjectOrchestrationState(
      data.projectId,
      userId,
      data.workflowRunId,
      data.preview,
    );
    await persistProjectOrchestrationState(data.workflowRunId, state);
    return { ok: true as const, state };
  });

const verifySchema = projectSchema.extend({
  workflowRunId: z.string().uuid().optional(),
  preview: z
    .object({
      ok: z.boolean(),
      lastError: z.string().nullable(),
    })
    .optional(),
});

/** Verifica GitHub + Vercel + sitio para tareas deployment del workflow. */
export const verifyProjectDeploymentStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => verifySchema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId!;
    const sb = context.supabase!;
    const { data: project } = await sb
      .from("projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!project) return { ok: false as const, error: "project_not_found" as const };

    const result = await verifyProjectDeploymentIntegrations(
      data.projectId,
      userId,
      data.workflowRunId ?? null,
      data.preview,
    );
    return {
      ok: true as const,
      ready: result.ok,
      githubOk: result.githubOk,
      vercelOk: result.vercelOk,
      siteOk: result.siteOk,
      previewOk: result.previewOk,
      message: result.message,
      guidance: result.guidance,
      state: result.state,
    };
  });
