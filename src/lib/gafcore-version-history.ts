import type { FileItem } from "@/components/ide/CodeEditor";

export const GAFCORE_VERSIONS_STORAGE_PREFIX = "gafcore-versions-v1:";
const MAX_VERSIONS_PER_PROJECT = 20;

export type GafcoreVersionEntry = {
  id: string;
  timestamp: number;
  label: string;
  files: FileItem[];
  fileCount: number;
  isAuto: boolean;
};

function storageKey(projectId: string): string {
  return `${GAFCORE_VERSIONS_STORAGE_PREFIX}${projectId}`;
}

function cloneFiles(files: FileItem[]): FileItem[] {
  return files.map((f) => ({
    name: f.name,
    language: f.language ?? "typescript",
    content: f.content,
  }));
}

function normalizeLabel(label: string, isAuto: boolean): string {
  const trimmed = label.trim().slice(0, 200);
  if (trimmed) return trimmed;
  return isAuto ? "Build automático" : "Versión manual";
}

function readRaw(projectId: string): GafcoreVersionEntry[] {
  if (typeof window === "undefined" || !projectId.trim()) return [];
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GafcoreVersionEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v) =>
        v &&
        typeof v.id === "string" &&
        typeof v.timestamp === "number" &&
        Array.isArray(v.files),
    );
  } catch {
    return [];
  }
}

function writeRaw(projectId: string, versions: GafcoreVersionEntry[]): void {
  if (typeof window === "undefined" || !projectId.trim()) return;
  try {
    localStorage.setItem(storageKey(projectId), JSON.stringify(versions.slice(0, MAX_VERSIONS_PER_PROJECT)));
  } catch {
    /* quota */
  }
}

function pushVersion(
  projectId: string,
  files: FileItem[],
  label: string,
  isAuto: boolean,
): GafcoreVersionEntry | null {
  if (!projectId.trim() || files.length === 0) return null;
  const entry: GafcoreVersionEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: Date.now(),
    label: normalizeLabel(label, isAuto),
    files: cloneFiles(files),
    fileCount: files.length,
    isAuto,
  };
  const next = [entry, ...readRaw(projectId)].slice(0, MAX_VERSIONS_PER_PROJECT);
  writeRaw(projectId, next);
  return entry;
}

export function loadVersions(projectId: string): GafcoreVersionEntry[] {
  return readRaw(projectId).sort((a, b) => b.timestamp - a.timestamp);
}

export function saveAutoVersion(
  projectId: string,
  files: FileItem[],
  label: string,
): GafcoreVersionEntry | null {
  return pushVersion(projectId, files, label, true);
}

export function saveManualVersion(
  projectId: string,
  files: FileItem[],
  label: string,
): GafcoreVersionEntry | null {
  return pushVersion(projectId, files, label, false);
}

export function formatVersionTime(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "—";
  const now = Date.now();
  const diffMs = now - timestamp;
  if (diffMs < 60_000) return "Hace un momento";
  if (diffMs < 3_600_000) {
    const mins = Math.floor(diffMs / 60_000);
    return `Hace ${mins} min`;
  }
  if (diffMs < 86_400_000) {
    const hours = Math.floor(diffMs / 3_600_000);
    return `Hace ${hours} h`;
  }
  return date.toLocaleString("es", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
