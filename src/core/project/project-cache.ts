const NAME_KEY = "gafcore.project.activeName";
const ID_KEY = "gafcore.project.activeId";

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
