import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { retrieveProjectMemoryContext } from "@/memory/retrieve.server";

const recordDecisionSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().max(200).optional(),
  body: z.string().min(1).max(4000),
  tags: z.array(z.string().max(40)).max(12).optional(),
  source: z.enum(["chat", "validation", "template", "user", "system"]).optional(),
  pipelineRunId: z.string().uuid().optional(),
});

/** Guarda una decisión o convención del proyecto (memoria procedural). */
export const recordProjectDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => recordDecisionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId!;
    const { data: project } = await context.supabase!
      .from("projects")
      .select("id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project?.id) return { ok: false as const, error: "project_not_found" };

    const { error } = await supabaseAdmin.from("project_decisions").insert({
      project_id: data.projectId,
      user_id: userId,
      title: data.title?.trim() || "Decisión",
      body: data.body.trim(),
      tags: data.tags ?? [],
      source: data.source ?? "user",
      pipeline_run_id: data.pipelineRunId ?? null,
    });

    if (error) {
      console.error("[memory] record decision:", error);
      return { ok: false as const, error: "db_error" };
    }
    return { ok: true as const };
  });

const previewSchema = z.object({
  projectId: z.string().uuid().optional(),
  instruction: z.string().max(8000),
  files: z
    .array(
      z.object({
        name: z.string(),
        language: z.string().optional(),
        content: z.string(),
      }),
    )
    .max(80),
});

/** Vista previa del Memory Pack (debug / admin UI futura). */
export const previewProjectMemoryPack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => previewSchema.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = await retrieveProjectMemoryContext({
      projectId: data.projectId,
      userId: context.userId!,
      instruction: data.instruction,
      files: data.files,
    });
    return {
      ok: true,
      promptAppendix: ctx.promptAppendix,
      priorityPaths: ctx.priorityPaths,
      meta: ctx.meta,
    };
  });
