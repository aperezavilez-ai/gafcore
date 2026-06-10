import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isGafcoreAdminUser } from "@/lib/gafcore-admin-role.server";
import {
  auditAiActionCompleted,
} from "@/lib/gafcore-governance.server";
import { consumeCriticalActionApproval } from "@/lib/gafcore-governance-approval.server";
import {
  listActiveTemplates,
  loadTemplateFilesBySlug,
} from "@/lib/gafcore-templates.server";
import {
  validateTemplateFiles,
  type GafcoreTemplateFile,
} from "@/lib/gafcore-templates.shared";

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

function adminUnavailable(): { ok: false; error: string } {
  return {
    ok: false,
    error:
      "El servidor no tiene SUPABASE_SERVICE_ROLE_KEY. Añádela en Vercel o .env.local del host.",
  };
}

export async function listProjectTemplatesForUser(userId: string) {
  try {
    const templates = await listActiveTemplates(userId);
    return { ok: true as const, templates };
  } catch (e) {
    console.error("[projects-api] list templates:", e);
    return adminUnavailable();
  }
}

export type ProjectListRow = {
  id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
  deploy_site_url?: string | null;
  github_repo?: string | null;
};

/** Lista proyectos del usuario (service role — evita fallos de JWT/RLS en el cliente). */
export async function listProjectsForUser(
  userId: string,
): Promise<{ ok: true; projects: ProjectListRow[] } | { ok: false; error: string }> {
  try {
    const admin = await isGafcoreAdminUser(userId);
    let q = supabaseAdmin
      .from("projects")
      .select("id, name, created_at, updated_at, deploy_site_url, github_repo")
      .order("updated_at", { ascending: false, nullsFirst: false });

    if (!admin) {
      q = q.eq("user_id", userId);
    }

    const { data, error } = await q;
    if (error) {
      console.error("[projects-api] list:", error);
      const fallback = await supabaseAdmin
        .from("projects")
        .select("id, name, created_at, updated_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (fallback.error) {
        return { ok: false, error: fallback.error.message?.trim() || "No se pudieron listar proyectos." };
      }
      return { ok: true, projects: (fallback.data ?? []) as ProjectListRow[] };
    }

    return { ok: true, projects: (data ?? []) as ProjectListRow[] };
  } catch (e) {
    console.error("[projects-api] list exception:", e);
    return adminUnavailable();
  }
}

export type ProjectFileSaveRow = {
  name: string;
  language?: string;
  content: string;
};

/** Guarda archivos del proyecto (service role — evita fallos RLS en cliente). */
export async function saveProjectFilesForUser(
  userId: string,
  projectId: string,
  files: ProjectFileSaveRow[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const admin = await isGafcoreAdminUser(userId);
    const { data: proj, error: qErr } = await supabaseAdmin
      .from("projects")
      .select("id, user_id")
      .eq("id", projectId)
      .maybeSingle();

    if (qErr || !proj?.id) {
      return { ok: false, error: "project_not_found" };
    }
    if (!admin && proj.user_id !== userId) {
      return { ok: false, error: "forbidden" };
    }
    if (!proj.user_id) {
      await supabaseAdmin.from("projects").update({ user_id: userId }).eq("id", projectId);
    }

    const map = new Map<string, ProjectFileSaveRow>();
    for (const f of files) map.set(f.name, f);
    const rows = Array.from(map.values()).map((f) => ({
      project_id: projectId,
      name: f.name,
      language: f.language ?? "plaintext",
      content: f.content,
    }));

    const { error: delErr } = await supabaseAdmin
      .from("project_files")
      .delete()
      .eq("project_id", projectId);
    if (delErr) {
      return { ok: false, error: delErr.message?.trim() || "delete_failed" };
    }

    if (rows.length > 0) {
      const { error: insErr } = await supabaseAdmin.from("project_files").insert(rows);
      if (insErr) {
        return { ok: false, error: insErr.message?.trim() || "insert_failed" };
      }
    }

    await supabaseAdmin
      .from("projects")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", projectId);

    return { ok: true };
  } catch (e) {
    console.error("[projects-api] save files exception:", e);
    return adminUnavailable();
  }
}

export async function createProjectForUser(
  userId: string,
  name: string,
  opts?: { templateSlug?: string; customFiles?: GafcoreTemplateFile[] },
): Promise<
  | {
      ok: true;
      project: { id: string; name: string; created_at: string };
      files: GafcoreTemplateFile[];
    }
  | { ok: false; error: string }
> {
  try {
    const imported = opts?.customFiles?.length
      ? validateTemplateFiles(opts.customFiles)
      : null;
    const files =
      imported && imported.length > 0
        ? imported
        : await loadTemplateFilesBySlug(opts?.templateSlug ?? "blank-vite", userId);
    if (!files.length) {
      return {
        ok: false,
        error: imported
          ? "No hay archivos válidos para importar."
          : "No se encontró la plantilla seleccionada.",
      };
    }

    const { data: project, error: pErr } = await supabaseAdmin
      .from("projects")
      .insert({ name: name.trim(), user_id: userId })
      .select("id, name, created_at")
      .single();

    if (pErr || !project?.id) {
      console.error("[projects-api] create:", pErr);
      return {
        ok: false,
        error: pErr?.message?.trim() || "No se pudo crear el proyecto.",
      };
    }

    const rows = files.map((f) => ({
      project_id: project.id,
      name: f.name,
      language: f.language,
      content: f.content,
    }));

    const { error: fErr } = await supabaseAdmin.from("project_files").insert(rows);
    if (fErr) {
      console.error("[projects-api] insert files:", fErr);
      await supabaseAdmin.from("projects").delete().eq("id", project.id);
      return {
        ok: false,
        error: fErr.message?.trim() || "No se pudieron guardar los archivos.",
      };
    }

    return {
      ok: true,
      project: {
        id: project.id as string,
        name: project.name as string,
        created_at: project.created_at as string,
      },
      files,
    };
  } catch (e) {
    console.error("[projects-api] create exception:", e);
    return adminUnavailable();
  }
}

export async function deleteProjectForUser(
  userId: string,
  projectId: string,
  approvalId?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    if (!approvalId) {
      return {
        ok: false,
        error: "Confirma la eliminación en el diálogo de seguridad antes de continuar.",
      };
    }

    const approved = await consumeCriticalActionApproval({
      userId,
      approvalId,
      action: "project.delete",
      resourceId: projectId,
    });
    if (!approved.ok) {
      return { ok: false, error: approved.error };
    }

    const { data: proj, error: qErr } = await supabaseAdmin
      .from("projects")
      .select("id, user_id")
      .eq("id", projectId)
      .maybeSingle();

    if (qErr) {
      return { ok: false, error: "No se pudo comprobar el proyecto." };
    }
    if (!proj?.id) {
      return { ok: false, error: "Proyecto no encontrado." };
    }

    const admin = await isGafcoreAdminUser(userId);
    if (proj.user_id != null && proj.user_id !== userId && !admin) {
      return { ok: false, error: "No tienes permiso para eliminar este proyecto." };
    }

    if (!proj.user_id) {
      await supabaseAdmin
        .from("projects")
        .update({ user_id: userId })
        .eq("id", projectId)
        .is("user_id", null);
    }

    await supabaseAdmin.from("chat_messages").delete().eq("project_id", projectId);

    for (const table of PROJECT_CHILD_TABLES) {
      const { error } = await supabaseAdmin.from(table).delete().eq("project_id", projectId);
      if (error) console.warn(`[projects-api] ${table}:`, error);
    }

    const { data: deletedRows, error: delErr } = await supabaseAdmin
      .from("projects")
      .delete()
      .eq("id", projectId)
      .select("id");

    if (delErr) {
      return { ok: false, error: delErr.message?.trim() || "No se pudo eliminar." };
    }
    if (!deletedRows?.length) {
      return { ok: false, error: "No se eliminó el proyecto." };
    }

    auditAiActionCompleted({
      userId,
      action: "project.delete",
      instruction: `delete project ${projectId}`,
      projectId,
      risk: { score: 70, level: "high", signals: ["project.delete"], requiresConfirmation: true, blocked: false },
    });

    return { ok: true };
  } catch (e) {
    console.error("[projects-api] delete exception:", e);
    return adminUnavailable();
  }
}
