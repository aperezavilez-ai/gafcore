const NAME_KEY = "gafcore.project.activeName";
const ID_KEY = "gafcore.project.activeId";
const IDE_PROJECT_KEY = "ide.project.id";
const IDE_SESSION_KEY = "gafcore.ide.session";
const PENDING_FILES_PREFIX = "gafcore.pendingProjectFiles.";

export type PendingProjectFile = {
  name: string;
  language?: string;
  content: string;
};

export function cacheActiveProject(id: string | null, name: string): void {
  try {
    if (id) localStorage.setItem(ID_KEY, id);
    else localStorage.removeItem(ID_KEY);
    const trimmed = name.trim();
    if (trimmed) localStorage.setItem(NAME_KEY, trimmed);
  } catch {
    /* ignore */
  }
}

export function readCachedProjectName(): string {
  try {
    return localStorage.getItem(NAME_KEY)?.trim() || "GafCore";
  } catch {
    return "GafCore";
  }
}

export function readCachedProjectId(): string | null {
  try {
    return localStorage.getItem(ID_KEY);
  } catch {
    return null;
  }
}

/** Limpia cachés locales del proyecto activo (IDE + gafcore). */
export function clearActiveProjectCache(): void {
  try {
    localStorage.removeItem(ID_KEY);
    localStorage.removeItem(NAME_KEY);
    localStorage.removeItem(IDE_PROJECT_KEY);
  } catch {
    /* ignore */
  }
}

/** Tras eliminar en servidor: quita el id de todas las cachés cliente. */
export function invalidateProjectFromClientCaches(projectId: string): void {
  try {
    if (localStorage.getItem(ID_KEY) === projectId) {
      localStorage.removeItem(ID_KEY);
      localStorage.removeItem(NAME_KEY);
    }
    if (localStorage.getItem(IDE_PROJECT_KEY) === projectId) {
      localStorage.removeItem(IDE_PROJECT_KEY);
    }
    sessionStorage.removeItem(`${PENDING_FILES_PREFIX}${projectId}`);
  } catch {
    /* ignore */
  }
}

export function readIdeSessionKey(): string {
  try {
    return localStorage.getItem(IDE_SESSION_KEY) ?? "0";
  } catch {
    return "0";
  }
}

export function bumpIdeSessionKey(): void {
  try {
    const n = parseInt(readIdeSessionKey(), 10) || 0;
    localStorage.setItem(IDE_SESSION_KEY, String(n + 1));
  } catch {
    /* ignore */
  }
}

/** Clave React para remontar el IDE al crear/eliminar/cambiar proyecto. */
export function readIdeMountKey(): string {
  let pid: string | null = null;
  try {
    pid = localStorage.getItem(ID_KEY) ?? localStorage.getItem(IDE_PROJECT_KEY);
  } catch {
    /* ignore */
  }
  return `${pid ?? "none"}:${readIdeSessionKey()}`;
}

export function notifyIdeSessionChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("gafcore:ide-session-changed"));
}

export function bumpIdeSessionAndNotify(): void {
  bumpIdeSessionKey();
  notifyIdeSessionChanged();
}

/** Plantilla recién creada (antes de que RLS devuelva project_files). */
export function stashPendingProjectFiles(
  projectId: string,
  files: PendingProjectFile[],
): void {
  try {
    sessionStorage.setItem(`${PENDING_FILES_PREFIX}${projectId}`, JSON.stringify(files));
  } catch {
    /* ignore */
  }
}

export function consumePendingProjectFiles(projectId: string): PendingProjectFile[] | null {
  try {
    const key = `${PENDING_FILES_PREFIX}${projectId}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    sessionStorage.removeItem(key);
    const parsed = JSON.parse(raw) as PendingProjectFile[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}
