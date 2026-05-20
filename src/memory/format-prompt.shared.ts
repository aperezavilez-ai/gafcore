import type { ProjectDecisionRow } from "@/memory/types";
import type { ProjectMemoryRow } from "@/lib/gafcore-ai-memory.shared";
import type { ImportGraph } from "@/memory/types";

export function formatValidationMemoryBlock(rows: ProjectMemoryRow[]): string {
  if (rows.length === 0) return "";
  const lines = rows.slice(0, 6).map((r) => {
    if (r.kind === "solution" && r.solution_hint) {
      return `- Solución conocida: ${r.solution_hint}`;
    }
    return `- Error frecuente (${r.hit_count}×): ${r.message}`;
  });
  return `\n\n[Memoria validación — evita repetir]\n${lines.join("\n")}`;
}

export function formatDecisionsBlock(rows: ProjectDecisionRow[]): string {
  if (rows.length === 0) return "";
  const lines = rows.slice(0, 8).map((d) => {
    const tag = d.tags.length ? ` [${d.tags.join(", ")}]` : "";
    const title = d.title.trim() ? `${d.title}: ` : "";
    return `- ${title}${d.body.slice(0, 400)}${tag}`;
  });
  return `\n\n[Decisiones y convenciones del proyecto]\n${lines.join("\n")}`;
}

export function formatGraphSummaryBlock(
  graph: ImportGraph,
  hubPaths: string[],
  neighborPaths: string[],
): string {
  const parts: string[] = [];
  if (hubPaths.length > 0) {
    parts.push(
      `Archivos centrales (muchos imports): ${hubPaths.slice(0, 8).join(", ")}`,
    );
  }
  if (neighborPaths.length > 0) {
    parts.push(
      `Relacionados con tu petición (grafo): ${neighborPaths.slice(0, 12).join(", ")}`,
    );
  }
  parts.push(`Índice estructural: ${graph.nodes.size} archivos, ${graph.edges.length} relaciones.`);
  if (parts.length === 0) return "";
  return `\n\n[Mapa del proyecto — respeta imports y no rompas dependientes]\n- ${parts.join("\n- ")}`;
}

export const GAFCORE_IDE_RUNTIME_PROFILE = `
[Perfil runtime GafCore IDE]
- Preview en iframe del navegador (sin servidor estático del proyecto salvo archivos que generes).
- Imágenes: URLs https verificables o assets/ con nombre exacto en el delta.
- Respeta stack existente en package.json; no mezcles frameworks distintos sin pedirlo.
`.trim();
