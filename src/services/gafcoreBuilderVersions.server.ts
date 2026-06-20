import {
  listProjectVersionsServer,
  saveProjectVersionServer,
  deleteProjectVersionServer,
  type VersionEntryDB,
} from "@/lib/gafcore-version-history.server";

/**
 * Historial de versiones para Builder V2.
 *
 * Reutiliza la tabla YA EXISTENTE `public.gafcore_project_versions` (la
 * misma que usa el IDE legado) y sus funciones de servidor — no se
 * duplica lógica de acceso a datos. La diferencia es de forma: Builder V2
 * guarda un único archivo `index.html` por versión (en vez de un arreglo
 * de archivos de un proyecto multi-archivo), así que aquí solo se adapta
 * la forma de entrada/salida.
 */

export interface BuilderVersionSummary {
  id: string;
  label: string;
  isAuto: boolean;
  createdAt: string;
}

export interface BuilderVersionWithHtml extends BuilderVersionSummary {
  html: string;
}

function toSummary(row: VersionEntryDB): BuilderVersionSummary {
  return {
    id: row.id,
    label: row.label,
    isAuto: row.is_auto,
    createdAt: row.created_at,
  };
}

function htmlFromRow(row: VersionEntryDB): string {
  return row.files.find((f) => f.name === "index.html")?.content ?? "";
}

export async function listBuilderVersions(
  projectId: string,
  userId: string,
): Promise<BuilderVersionSummary[]> {
  const rows = await listProjectVersionsServer(projectId, userId);
  return rows.map(toSummary);
}

export async function saveBuilderVersion(
  projectId: string,
  userId: string,
  html: string,
  label: string,
  isAuto: boolean,
): Promise<BuilderVersionSummary | null> {
  const row = await saveProjectVersionServer(
    projectId,
    userId,
    [{ name: "index.html", language: "html", content: html }],
    label,
    isAuto,
  );
  return row ? toSummary(row) : null;
}

export async function getBuilderVersionHtml(
  projectId: string,
  userId: string,
  versionId: string,
): Promise<string | null> {
  const rows = await listProjectVersionsServer(projectId, userId);
  const match = rows.find((r) => r.id === versionId);
  return match ? htmlFromRow(match) : null;
}

export async function deleteBuilderVersion(
  versionId: string,
  userId: string,
): Promise<boolean> {
  return deleteProjectVersionServer(versionId, userId);
}
