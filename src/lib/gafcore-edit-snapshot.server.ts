/**
 * Persistencia Supabase del snapshot de estructura (ediciones incrementales).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logDev } from "@/lib/gafcore-logger.server";
import {
  createCodeSnapshot,
  type GafcoreCodeSnapshot,
} from "@/lib/gafcore-incremental-edit.shared";
import type { ProjFile } from "@/lib/gafcore-chat.shared";

export type { GafcoreCodeSnapshot };

/** Guarda snapshot actual (upsert por project_id). */
export async function persistProjectCodeSnapshot(
  projectId: string | undefined,
  userId: string,
  files: ProjFile[],
): Promise<void> {
  if (!projectId || files.length < 2) return;
  const snapshot = createCodeSnapshot(files);
  const { error } = await supabaseAdmin.from("gafcore_project_code_snapshots").upsert(
    {
      project_id: projectId,
      user_id: userId,
      snapshot: snapshot as unknown as Record<string, unknown>,
      fingerprint: snapshot.fingerprint,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id" },
  );
  if (error) {
    if (error.code === "42P01") return;
    logDev("gafcore_snapshot_persist_error", { projectId, message: error.message });
  }
}

/** Último snapshot persistido del proyecto. */
export async function loadProjectCodeSnapshot(
  projectId: string | undefined,
  userId: string,
): Promise<GafcoreCodeSnapshot | null> {
  if (!projectId) return null;
  const { data, error } = await supabaseAdmin
    .from("gafcore_project_code_snapshots")
    .select("snapshot, user_id")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) {
    if (error.code === "42P01") return null;
    logDev("gafcore_snapshot_load_error", { projectId, message: error.message });
    return null;
  }
  if (!data?.snapshot || data.user_id !== userId) return null;
  const s = data.snapshot as GafcoreCodeSnapshot;
  if (!s.fingerprint || !Array.isArray(s.componentNames)) return null;
  return s;
}

/** Rutas extra a priorizar si existían en snapshot persistido. */
export function priorityPathsFromPersistedSnapshot(
  persisted: GafcoreCodeSnapshot | null,
): string[] {
  if (!persisted) return [];
  return [...new Set([...persisted.componentPaths, ...persisted.paths])].slice(0, 40);
}

/**
 * Si tras recargar el IDE faltan componentes del snapshot guardado, avisa al modelo.
 */
export function buildPersistedSnapshotPromptAppend(
  persisted: GafcoreCodeSnapshot | null,
  currentFiles: ProjFile[],
): string {
  if (!persisted || persisted.componentNames.length === 0) return "";
  const current = createCodeSnapshot(currentFiles);
  const missingNames = persisted.componentNames.filter(
    (n) => !current.componentNames.includes(n),
  );
  const missingPaths = persisted.componentPaths.filter(
    (p) => !current.paths.includes(p),
  );
  if (missingNames.length === 0 && missingPaths.length === 0) return "";

  return (
    "\n[RECUPERACIÓN DE SESIÓN] Snapshot persistido del proyecto detectó estructura previa. " +
    `Componentes que debes restaurar o mantener: ${missingNames.slice(0, 20).join(", ") || "(ver rutas)"}. ` +
    (missingPaths.length
      ? `Rutas previas: ${missingPaths.slice(0, 14).join(", ")}. `
      : "") +
    "No elimines estos elementos salvo petición explícita del usuario."
  );
}
