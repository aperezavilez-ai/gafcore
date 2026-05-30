/**
 * Agente GafCore (modelo tipo Lovable): plan breve + contexto de repo + cerebro V2 único.
 */
import { isSubstantiveBuildRequest } from "@/lib/gafcore-chat-intent.shared";
import type { ProjFile } from "@/lib/gafcore-chat.shared";

/** Por defecto activo; desactivar solo con GAFCORE_BRAIN_LEGACY=1 */
export function isGafcoreBrainV2Only(): boolean {
  if (typeof process === "undefined") return true;
  const legacy = process.env.GAFCORE_BRAIN_LEGACY?.trim().toLowerCase();
  return legacy !== "1" && legacy !== "true";
}

export function buildAgentProjectContext(files: Array<{ name: string; content: string }>): string {
  if (files.length === 0) {
    return "[CODEBASE] Proyecto vacío o plantilla. Crea App.tsx, main.tsx e index.html si hace falta.";
  }
  const lines = files.slice(0, 50).map((f) => {
    const n = f.name.replace(/\\/g, "/");
    const preview = f.content.replace(/\s+/g, " ").trim().slice(0, 120);
    return `- ${n} (${f.content.length} chars)${preview ? `: ${preview}…` : ""}`;
  });
  return `[CODEBASE — lee antes de editar]
${lines.join("\n")}
Reglas: delta mínimo; no reescribas archivos que no necesites; App.tsx suele ser la raíz del preview.`;
}

export function buildPlanModeAppend(instruction: string): string {
  if (!isSubstantiveBuildRequest(instruction)) return "";
  return `[PLAN MODE]
En "reply" primero 3 viñetas: (1) archivos a tocar, (2) riesgo, (3) pasos.
Luego el JSON con "files". No implementes en prosa sin files.`;
}

export function buildAgentModeAppend(instruction: string, previewError?: string): string {
  const parts: string[] = [];
  parts.push(buildPlanModeAppend(instruction));
  if (previewError?.trim()) {
    parts.push(
      `[PREVIEW ERROR — corrige en esta respuesta]
${previewError.trim().slice(0, 2000)}
Prioridad: sintaxis JSX válida, tags cerrados, export default en App.`,
    );
  }
  return parts.filter(Boolean).join("\n\n");
}

export function mergeContextWithDelta(
  contextFiles: ProjFile[],
  deltaFiles: Array<{ name: string; content: string }>,
): Array<{ name: string; content: string }> {
  const map = new Map(contextFiles.map((f) => [f.name, f.content]));
  for (const f of deltaFiles) {
    map.set(f.name, f.content);
  }
  return [...map.entries()].map(([name, content]) => ({ name, content }));
}
