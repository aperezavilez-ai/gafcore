import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ImportGraph } from "@/memory/types";
import type { ProjFile } from "@/lib/gafcore-chat.shared";
import { contentHashForFile } from "@/memory/import-graph.shared";

/** Persiste grafo de imports (service role). Best-effort, no bloquea el chat. */
export async function persistProjectImportGraph(
  projectId: string,
  files: ProjFile[],
  graph: ImportGraph,
): Promise<void> {
  const codeFiles = files.filter((f) => /\.(tsx?|jsx?|mjs|cjs)$/i.test(f.name));
  const now = new Date().toISOString();

  for (const f of codeFiles) {
    const path = f.name.replace(/\\/g, "/");
    await supabaseAdmin.from("project_graph_nodes").upsert(
      {
        project_id: projectId,
        path,
        node_kind: "file",
        content_hash: contentHashForFile(f),
        metadata: {},
        updated_at: now,
      },
      { onConflict: "project_id,path" },
    );
  }

  const importEdges = graph.edges.filter((e) => e.kind === "imports");
  for (const e of importEdges.slice(0, 200)) {
    await supabaseAdmin.from("project_graph_edges").upsert(
      {
        project_id: projectId,
        from_path: e.from,
        to_path: e.to,
        edge_kind: "imports",
        confidence: 1,
        updated_at: now,
      },
      { onConflict: "project_id,from_path,to_path,edge_kind" },
    );
  }
}

/** Vecinos persistidos (si la migración está aplicada). */
export async function loadPersistedNeighborPaths(
  projectId: string,
  seedPaths: string[],
  depth = 2,
): Promise<string[]> {
  const seeds = seedPaths.map((p) => p.replace(/\\/g, "/"));
  const visited = new Set<string>(seeds);
  let frontier = [...seeds];

  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const path of frontier) {
      const { data: out } = await supabaseAdmin
        .from("project_graph_edges")
        .select("to_path")
        .eq("project_id", projectId)
        .eq("from_path", path)
        .eq("edge_kind", "imports");
      const { data: inn } = await supabaseAdmin
        .from("project_graph_edges")
        .select("from_path")
        .eq("project_id", projectId)
        .eq("to_path", path)
        .eq("edge_kind", "imports");

      for (const row of out ?? []) {
        const t = row.to_path as string;
        if (!visited.has(t)) {
          visited.add(t);
          next.push(t);
        }
      }
      for (const row of inn ?? []) {
        const t = row.from_path as string;
        if (!visited.has(t)) {
          visited.add(t);
          next.push(t);
        }
      }
    }
    frontier = next;
  }
  return [...visited];
}
