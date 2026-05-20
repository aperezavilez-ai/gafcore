import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { retrieveProjectMemoryContext } from "@/memory/retrieve.server";

async function assertProjectOwned(
  sb: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await sb
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data?.id);
}

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
    const owned = await assertProjectOwned(context.supabase!, data.projectId, userId);
    if (!owned) return { ok: false as const, error: "project_not_found" };

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

const projectIdSchema = z.object({ projectId: z.string().uuid() });

/** Lista convenciones del proyecto (IDE / ajustes). */
export const listProjectDecisions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => projectIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId!;
    const owned = await assertProjectOwned(context.supabase!, data.projectId, userId);
    if (!owned) return { ok: false as const, decisions: [] };

    const { data: rows, error } = await supabaseAdmin
      .from("project_decisions")
      .select("id, title, body, tags, source, created_at")
      .eq("project_id", data.projectId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      if (error.code === "42P01") return { ok: true as const, decisions: [] };
      console.error("[memory] list:", error);
      return { ok: false as const, decisions: [] };
    }

    return {
      ok: true as const,
      decisions: (rows ?? []).map((r) => ({
        id: r.id as string,
        title: r.title ?? "",
        body: r.body ?? "",
        tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
        source: r.source ?? "user",
        created_at: r.created_at ?? "",
      })),
    };
  });

const updateDecisionSchema = z.object({
  projectId: z.string().uuid(),
  decisionId: z.string().uuid(),
  title: z.string().max(200).optional(),
  body: z.string().min(1).max(4000),
  tags: z.array(z.string().max(40)).max(12).optional(),
});

export const updateProjectDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => updateDecisionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId!;
    const owned = await assertProjectOwned(context.supabase!, data.projectId, userId);
    if (!owned) return { ok: false as const, error: "project_not_found" };

    const { error } = await supabaseAdmin
      .from("project_decisions")
      .update({
        title: data.title?.trim() || "Convención",
        body: data.body.trim(),
        tags: data.tags ?? [],
      })
      .eq("id", data.decisionId)
      .eq("project_id", data.projectId)
      .eq("user_id", userId);

    if (error) {
      console.error("[memory] update:", error);
      return { ok: false as const, error: "db_error" };
    }
    return { ok: true as const };
  });

const deleteDecisionSchema = z.object({
  projectId: z.string().uuid(),
  decisionId: z.string().uuid(),
});

export const deleteProjectDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => deleteDecisionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId!;
    const owned = await assertProjectOwned(context.supabase!, data.projectId, userId);
    if (!owned) return { ok: false as const, error: "project_not_found" };

    const { error } = await supabaseAdmin
      .from("project_decisions")
      .delete()
      .eq("id", data.decisionId)
      .eq("project_id", data.projectId)
      .eq("user_id", userId);

    if (error) {
      console.error("[memory] delete:", error);
      return { ok: false as const, error: "db_error" };
    }
    return { ok: true as const };
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
