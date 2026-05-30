import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logDev } from "@/lib/gafcore-logger.server";
import { formatMemoryHintsForPrompt, type ProjectMemoryRow } from "@/lib/gafcore-ai-memory.shared";
import {
  buildImportGraph,
  expandGraphNeighbors,
  seedPathsFromInstruction,
} from "@/memory/import-graph.shared";
import {
  formatDecisionsBlock,
  formatGraphSummaryBlock,
  GAFCORE_IDE_RUNTIME_PROFILE,
} from "@/memory/format-prompt.shared";
import {
  loadPersistedNeighborPaths,
  persistProjectImportGraph,
} from "@/memory/graph-persist.server";
import type { MemoryRetrieveInput, ProjectDecisionRow, ProjectMemoryContext } from "@/memory/types";

async function loadProjectDecisions(
  projectId: string,
  userId: string,
): Promise<ProjectDecisionRow[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from("project_decisions")
      .select("title, body, tags, source, created_at")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) {
      if (error.code === "42P01") return [];
      console.warn("[memory] decisions:", error.message);
      return [];
    }
    return (data ?? []).map((r) => ({
      title: r.title ?? "",
      body: r.body ?? "",
      tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
      source: r.source ?? "chat",
      created_at: r.created_at ?? "",
    }));
  } catch {
    return [];
  }
}

/** Carga filas de validación directamente (evita doble formato). */
async function loadValidationMemoryRows(
  projectId: string,
  userId: string,
): Promise<ProjectMemoryRow[]> {
  const { data: project } = await supabaseAdmin
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project?.id) return [];

  const { data: rows, error } = await supabaseAdmin
    .from("project_ai_memory")
    .select("kind, fingerprint, message, solution_hint, hit_count")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("hit_count", { ascending: false })
    .limit(8);

  if (error || !rows?.length) return [];
  return rows.map((r) => ({
    kind: r.kind as "error" | "solution",
    fingerprint: r.fingerprint,
    message: r.message,
    solution_hint: r.solution_hint,
    hit_count: r.hit_count ?? 1,
  }));
}

function hubPathsFromGraph(graph: ReturnType<typeof buildImportGraph>, limit = 6): string[] {
  const scores = new Map<string, number>();
  for (const [, list] of graph.inbound) {
    for (const p of list) {
      scores.set(p, (scores.get(p) ?? 0) + 1);
    }
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([p]) => p);
}

/**
 * Memory Service M0/M1: recupera contexto antes de generar código.
 * Combina validación, decisiones, grafo de imports y perfil IDE.
 */
export async function retrieveProjectMemoryContext(
  input: MemoryRetrieveInput,
): Promise<ProjectMemoryContext> {
  const t0 = Date.now();
  const { projectId, userId, instruction, files } = input;

  const graph = buildImportGraph(files);
  const seeds = seedPathsFromInstruction(instruction, files);
  let neighborPaths = expandGraphNeighbors(graph, seeds, 2);

  if (projectId) {
    void persistProjectImportGraph(projectId, files, graph).catch((e) => {
      console.warn("[memory] graph persist:", e);
    });
    try {
      const persisted = await loadPersistedNeighborPaths(projectId, seeds, 2);
      if (persisted.length > neighborPaths.length) {
        neighborPaths = [...new Set([...neighborPaths, ...persisted])];
      }
    } catch {
      /* tabla aún sin migrar */
    }
  }

  const priorityPaths = [
    ...new Set([...seeds, ...neighborPaths, ...hubPathsFromGraph(graph)]),
  ];

  let validationRows: ProjectMemoryRow[] = [];
  let decisions: ProjectDecisionRow[] = [];

  if (projectId) {
    [validationRows, decisions] = await Promise.all([
      loadValidationMemoryRows(projectId, userId),
      loadProjectDecisions(projectId, userId),
    ]);
  }

  const blocks = [
    GAFCORE_IDE_RUNTIME_PROFILE,
    formatMemoryHintsForPrompt(validationRows),
    formatDecisionsBlock(decisions),
    formatGraphSummaryBlock(graph, hubPathsFromGraph(graph), neighborPaths),
  ].filter(Boolean);

  const promptAppendix = blocks.join("");

  const meta = {
    ms: Date.now() - t0,
    validationHints: validationRows.length,
    decisions: decisions.length,
    graphNodes: graph.nodes.size,
    graphEdges: graph.edges.length,
    neighborExpansion: neighborPaths.length,
  };

  if (projectId && meta.ms > 0) {
    logDev("gafcore_memory_retrieve", { projectId, ...meta });
  }

  return { promptAppendix, priorityPaths, meta };
}
