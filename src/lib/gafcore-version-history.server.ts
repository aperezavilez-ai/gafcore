/**
 * Persistencia de historial de versiones en Supabase.
 * Reemplaza la implementación localStorage de gafcore-version-history.ts.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logDev } from "@/lib/gafcore-logger.server";
import type { FileItem } from "@/components/ide/CodeEditor";

const MAX_VERSIONS_PER_PROJECT = 30;

export type VersionEntryDB = {
  id: string;
  project_id: string;
  label: string;
  files: FileItem[];
  file_count: number;
  is_auto: boolean;
  created_at: string;
};

/** Lista versiones de un proyecto (más reciente primero). */
export async function listProjectVersionsServer(
  projectId: string,
  userId: string,
): Promise<VersionEntryDB[]> {
  const { data, error } = await supabaseAdmin
    .from("gafcore_project_versions")
    .select("id, project_id, label, files, file_count, is_auto, created_at")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(MAX_VERSIONS_PER_PROJECT);

  if (error) {
    if (error.code === "42P01") return []; // tabla aún no existe
    logDev("gafcore_versions_list_error", { projectId, message: error.message });
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    project_id: row.project_id,
    label: row.label,
    files: (row.files as FileItem[]) ?? [],
    file_count: row.file_count,
    is_auto: row.is_auto,
    created_at: row.created_at,
  }));
}

/** Guarda una versión y aplica el límite MAX_VERSIONS_PER_PROJECT (elimina las más antiguas). */
export async function saveProjectVersionServer(
  projectId: string,
  userId: string,
  files: FileItem[],
  label: string,
  isAuto: boolean,
): Promise<VersionEntryDB | null> {
  if (!projectId.trim() || files.length === 0) return null;

  const normalizedLabel = label.trim().slice(0, 200) || (isAuto ? "Build automático" : "Versión manual");
  const fileCount = files.length;

  const cloned = files.map((f) => ({
    name: f.name,
    language: f.language ?? "typescript",
    content: f.content,
  }));

  const { data, error } = await supabaseAdmin
    .from("gafcore_project_versions")
    .insert({
      project_id: projectId,
      user_id: userId,
      label: normalizedLabel,
      files: cloned,
      file_count: fileCount,
      is_auto: isAuto,
    })
    .select("id, project_id, label, files, file_count, is_auto, created_at")
    .single();

  if (error) {
    if (error.code === "42P01") return null;
    logDev("gafcore_versions_save_error", { projectId, message: error.message });
    return null;
  }

  // Limpiar versiones que exceden el límite (mantener las MAX más recientes)
  void pruneOldVersions(projectId, userId);

  return {
    id: data.id,
    project_id: data.project_id,
    label: data.label,
    files: (data.files as FileItem[]) ?? [],
    file_count: data.file_count,
    is_auto: data.is_auto,
    created_at: data.created_at,
  };
}

/** Elimina una versión específica. */
export async function deleteProjectVersionServer(
  versionId: string,
  userId: string,
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from("gafcore_project_versions")
    .delete()
    .eq("id", versionId)
    .eq("user_id", userId);

  if (error) {
    logDev("gafcore_versions_delete_error", { versionId, message: error.message });
    return false;
  }
  return true;
}

/** Poda versiones antiguas para no exceder MAX_VERSIONS_PER_PROJECT. */
async function pruneOldVersions(projectId: string, userId: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from("gafcore_project_versions")
    .select("id, created_at")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (!data || data.length <= MAX_VERSIONS_PER_PROJECT) return;

  const toDelete = data.slice(MAX_VERSIONS_PER_PROJECT).map((r) => r.id);
  await supabaseAdmin
    .from("gafcore_project_versions")
    .delete()
    .in("id", toDelete)
    .eq("user_id", userId);
}
