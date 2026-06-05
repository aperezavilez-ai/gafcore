/**
 * Validación de archivos devueltos por la IA (sin deps de servidor).
 */

export type GafcoreOutputFile = { name: string; language?: string; content: string };

const SAFE_PATH = /^[a-zA-Z0-9_\-. /]+$/;
const MAX_FILE_OUT = 450_000;

const FILE_NAME_KEYS = ["name", "path", "filename", "file", "fileName"] as const;

function resolveOutputFileName(row: Record<string, unknown>): string | null {
  for (const key of FILE_NAME_KEYS) {
    const raw = row[key];
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim().replace(/\\/g, "/").replace(/^\/+/, "");
    if (trimmed.length > 0) return trimmed;
  }
  return null;
}

function isSafeOutputPath(name: string): boolean {
  if (name.includes("..") || name.startsWith("/")) return false;
  if (name.length === 0 || name.length > 512) return false;
  return SAFE_PATH.test(name);
}

/** Valida filas `{ name|path, content }` de la IA. Dedupe por nombre (último gana). */
export function validateOutputFiles(raw: unknown): GafcoreOutputFile[] {
  if (!Array.isArray(raw)) return [];
  const byName = new Map<string, GafcoreOutputFile>();
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const name = resolveOutputFileName(rec);
    if (!name || !isSafeOutputPath(name)) continue;
    const content = rec.content;
    if (typeof content !== "string") continue;
    if (content.trim().length === 0) continue;
    if (content.length > MAX_FILE_OUT) continue;
    const language = rec.language;
    byName.set(name, {
      name,
      language: typeof language === "string" ? language : undefined,
      content,
    });
  }
  return [...byName.values()];
}
