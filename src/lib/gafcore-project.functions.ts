import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const deleteProjectInput = z.object({
  projectId: z.string().uuid(),
});

const PROJECT_CHILD_TABLES = [
  "project_files",
  "project_snapshots",
  "project_secrets",
  "mcp_connections",
  "project_publishes",
  "project_ai_memory",
  "project_decisions",
  "project_graph_nodes",
  "project_graph_edges",
  "gafcore_validation_runs",
  "gafcore_pipeline_runs",
  "gafcore_workflow_runs",
] as const;

/**
 * Elimina un proyecto en servidor con el cliente Supabase del JWT (RLS).
 * No usa service role: funciona en local sin SUPABASE_SERVICE_ROLE_KEY si existen
 * SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY (mismo criterio que requireSupabaseAuth).
 */
export const deleteGafcoreProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => deleteProjectInput.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId as string;
    const sb = context.supabase;
    const { projectId } = data;

    const { data: proj, error: qErr } = await sb
      .from("projects")
      .select("id, user_id")
      .eq("id", projectId)
      .maybeSingle();

    if (qErr) {
      console.error("[deleteGafcoreProject] select:", qErr);
      return { ok: false as const, error: "No se pudo comprobar el proyecto." };
    }
    if (!proj?.id) {
      return { ok: false as const, error: "Proyecto no encontrado." };
    }

    const { data: adminRow } = await sb
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    const admin = !!adminRow;

    if (proj.user_id != null && proj.user_id !== userId && !admin) {
      return {
        ok: false as const,
        error: "No tienes permiso para eliminar este proyecto.",
      };
    }

    if (!proj.user_id) {
      const { error: claimErr } = await sb
        .from("projects")
        .update({ user_id: userId })
        .eq("id", projectId)
        .is("user_id", null);
      if (claimErr) {
        console.warn("[deleteGafcoreProject] claim orphan:", claimErr);
      }
    }

    const { error: chatErr } = await sb.from("chat_messages").delete().eq("project_id", projectId);
    if (chatErr) {
      console.warn("[deleteGafcoreProject] chat_messages:", chatErr);
    }

    for (const table of PROJECT_CHILD_TABLES) {
      const { error } = await sb.from(table).delete().eq("project_id", projectId);
      if (error) {
        console.warn(`[deleteGafcoreProject] ${table}:`, error);
      }
    }

    const { data: deletedRows, error: delErr } = await sb
      .from("projects")
      .delete()
      .eq("id", projectId)
      .select("id");

    if (delErr) {
      console.error("[deleteGafcoreProject] delete projects:", delErr);
      return {
        ok: false as const,
        error: delErr.message?.trim() || "No se pudo eliminar el proyecto.",
      };
    }
    if (!deletedRows?.length) {
      return { ok: false as const, error: "No se eliminó ninguna fila del proyecto." };
    }

    return { ok: true as const };
  });
