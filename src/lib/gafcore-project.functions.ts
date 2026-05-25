import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isGafcoreAdminUser } from "@/lib/gafcore-admin-role.server";

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
  "gafcore_project_brands",
] as const;

/** Elimina un proyecto tras verificar sesión (service role en servidor). */
export const deleteGafcoreProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => deleteProjectInput.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId as string;
    const { projectId } = data;

    const { data: proj, error: qErr } = await supabaseAdmin
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

    const admin = await isGafcoreAdminUser(userId);

    if (proj.user_id != null && proj.user_id !== userId && !admin) {
      return {
        ok: false as const,
        error: "No tienes permiso para eliminar este proyecto.",
      };
    }

    if (!proj.user_id) {
      await supabaseAdmin
        .from("projects")
        .update({ user_id: userId })
        .eq("id", projectId)
        .is("user_id", null);
    }

    const { error: chatErr } = await supabaseAdmin
      .from("chat_messages")
      .delete()
      .eq("project_id", projectId);
    if (chatErr) {
      console.warn("[deleteGafcoreProject] chat_messages:", chatErr);
    }

    for (const table of PROJECT_CHILD_TABLES) {
      const { error } = await supabaseAdmin.from(table).delete().eq("project_id", projectId);
      if (error) {
        console.warn(`[deleteGafcoreProject] ${table}:`, error);
      }
    }

    const { data: deletedRows, error: delErr } = await supabaseAdmin
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
