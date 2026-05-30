import type { FileItem } from "@/components/ide/CodeEditor";
import { sanitizeProjectJsxFiles } from "@/lib/gafcore-media.shared";
import { ensureReactPackageJson } from "@/lib/gafcore-project-scaffold.shared";
import {
  dispatchCancelPreviewAutofix,
  GAFCORE_VERSION_RESTORED_EVENT,
} from "@/lib/gafcore-chat-autofix.shared";

function inferLanguage(name: string, explicit?: unknown): string {
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  if (name.endsWith(".tsx") || name.endsWith(".jsx")) return "typescript";
  if (name.endsWith(".ts")) return "typescript";
  if (name.endsWith(".css")) return "css";
  if (name.endsWith(".json")) return "json";
  return "plaintext";
}

/** Normaliza JSON de `project_snapshots.files` al formato del editor. */
export function normalizeSnapshotFiles(raw: unknown): FileItem[] | null {
  if (raw == null) return null;

  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === "object") {
    const values = Object.values(raw as Record<string, unknown>);
    if (
      values.length > 0 &&
      values.every((v) => v && typeof v === "object" && "name" in (v as object))
    ) {
      list = values;
    } else {
      return null;
    }
  } else {
    return null;
  }

  const out: FileItem[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    if (!name) continue;
    out.push({
      name,
      language: inferLanguage(name, rec.language),
      content: typeof rec.content === "string" ? rec.content : "",
    });
  }

  return out.length > 0 ? out : null;
}

export function prepareFilesForEditorRestore(files: FileItem[]): FileItem[] {
  return ensureReactPackageJson(sanitizeProjectJsxFiles(files));
}

/** Etiquetas de capturas automáticas que suelen ser estado con error (no punto de recuperación). */
export function isRiskySnapshotLabel(label: string | null | undefined): boolean {
  if (!label) return false;
  const l = label.toLowerCase();
  return (
    l.startsWith("auto-fix:") ||
    l.startsWith("auto:") ||
    /syntaxerror|unexpected token|error grave/i.test(l)
  );
}

/** Heurística rápida: ¿el snapshot probablemente no compila? */
export function snapshotLikelyHasSyntaxError(files: FileItem[]): boolean {
  for (const f of files) {
    if (!/\.(tsx|jsx)$/i.test(f.name)) continue;
    const c = f.content;
    if (/SyntaxError|Unexpected token/i.test(c)) return true;
    let depth = 0;
    for (const ch of c) {
      if (ch === "(" || ch === "{" || ch === "[") depth++;
      else if (ch === ")" || ch === "}" || ch === "]") depth--;
      if (depth < 0) return true;
    }
    if (depth !== 0) return true;
  }
  return false;
}

/** Tras restaurar: cancela auto-fix, pausa reintentos y avisa al chat. */
export function dispatchVersionRestored(): void {
  dispatchCancelPreviewAutofix();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(GAFCORE_VERSION_RESTORED_EVENT));
  }
}
