import { getIdeConfig } from "@/lib/ideConfig";
import {
  clearCurrentProjectId,
  createProject,
  getCurrentProjectId,
  getProjectDeployMeta,
  getUserSupabase,
  listProjects,
  renameProject,
  saveProjectDeployMeta,
  setCurrentProjectId,
  type ProjectDeployMeta,
  type ProjectRow,
} from "@/lib/userSupabase";
import { normalizeDeployHost } from "@/lib/gafcore-deploy.shared";
import { cacheActiveProject, readCachedProjectName } from "./project-cache";
import type { ActiveProjectState, WorkspaceBootstrap } from "./types";

export { cacheActiveProject, readCachedProjectName };

export {
  createProject,
  renameProject,
  listProjects,
  getProjectDeployMeta,
  saveProjectDeployMeta,
  getCurrentProjectId,
  setCurrentProjectId,
  clearCurrentProjectId,
};

export type { ProjectRow, ProjectDeployMeta };

/** Host público del sitio del usuario (Vercel), sin github.io ni gafcore.com. */
export function resolveDeploySiteHost(
  meta: ProjectDeployMeta | null | undefined,
  ideConfig = getIdeConfig(),
): string | null {
  return (
    normalizeDeployHost(meta?.deploy_site_url ?? ideConfig.deploySiteUrl) ?? null
  );
}

export async function listRecentProjects(limit = 8): Promise<ProjectRow[]> {
  const all = await listProjects();
  return all.slice(0, limit);
}

function activeFromRow(row: ProjectRow | null): ActiveProjectState {
  if (!row) {
    return { id: null, name: "Sin proyecto", row: null };
  }
  return { id: row.id, name: row.name, row };
}

/** Carga proyectos y resuelve el activo (caché local o el más reciente). */
export async function bootstrapWorkspace(): Promise<WorkspaceBootstrap> {
  const hasSupabase = Boolean(getUserSupabase());
  if (!hasSupabase) {
    return {
      hasSupabase: false,
      projects: [],
      active: { id: null, name: readCachedProjectName(), row: null },
    };
  }

  const projects = await listProjects();
  if (projects.length === 0) {
    const keepId = getCurrentProjectId();
    if (keepId) {
      cacheActiveProject(keepId, readCachedProjectName());
      return {
        hasSupabase: true,
        projects: [],
        active: { id: keepId, name: readCachedProjectName(), row: null },
      };
    }
    clearCurrentProjectId();
    cacheActiveProject(null, "Sin proyecto");
    return {
      hasSupabase: true,
      projects: [],
      active: { id: null, name: "Sin proyecto", row: null },
    };
  }

  let activeId = getCurrentProjectId();
  if (!activeId || !projects.some((p) => p.id === activeId)) {
    activeId = projects[0].id;
    setCurrentProjectId(activeId);
  }

  const row = projects.find((p) => p.id === activeId) ?? projects[0];
  cacheActiveProject(row.id, row.name);

  return {
    hasSupabase: true,
    projects,
    active: activeFromRow(row),
  };
}

/** Sincroniza menú «Cambiar proyecto» con la lista actual. */
export async function syncActiveFromList(
  projects: ProjectRow[],
  preferId?: string | null,
): Promise<ActiveProjectState> {
  if (projects.length === 0) {
    // Tras crear un proyecto, listProjects puede devolver [] (lag/columnas/RLS).
    // No borrar el activo si ya tenemos un id válido en caché.
    const keepId = preferId ?? getCurrentProjectId();
    if (keepId) {
      cacheActiveProject(keepId, readCachedProjectName());
      return { id: keepId, name: readCachedProjectName(), row: null };
    }
    clearCurrentProjectId();
    cacheActiveProject(null, "Sin proyecto");
    return activeFromRow(null);
  }

  const cur = preferId ?? getCurrentProjectId();
  const nextId = cur && projects.some((p) => p.id === cur) ? cur : projects[0].id;
  if (!nextId) {
    clearCurrentProjectId();
    return activeFromRow(null);
  }

  const row = projects.find((p) => p.id === nextId) ?? projects[0];
  setCurrentProjectId(row.id);
  cacheActiveProject(row.id, row.name);
  return activeFromRow(row);
}

export function activateProjectRow(row: ProjectRow): ActiveProjectState {
  setCurrentProjectId(row.id);
  cacheActiveProject(row.id, row.name);
  return activeFromRow(row);
}

export async function loadDeployHostForProject(projectId: string): Promise<string | null> {
  const meta = await getProjectDeployMeta(projectId);
  return resolveDeploySiteHost(meta);
}

export async function loadDeploySummaryForProject(projectId: string): Promise<{
  siteHost: string | null;
  githubRepo: string | null;
}> {
  const meta = await getProjectDeployMeta(projectId);
  return {
    siteHost: resolveDeploySiteHost(meta),
    githubRepo: meta?.github_repo?.trim() || null,
  };
}
