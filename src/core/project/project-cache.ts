const NAME_KEY = "gafcore.project.activeName";
const ID_KEY = "gafcore.project.activeId";
const IDE_PROJECT_KEY = "ide.project.id";

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
  } catch {
    /* ignore */
  }
}
