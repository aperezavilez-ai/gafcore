import type { ProjFile } from "@/lib/gafcore-chat.shared";

/** Entrada al Memory Service antes de cada generación IA. */
export type MemoryRetrieveInput = {
  projectId?: string;
  userId: string;
  instruction: string;
  files: ProjFile[];
};

/** Salida compacta para el prompt y para ampliar contexto de archivos. */
export type ProjectMemoryContext = {
  /** Texto a anexar al system prompt (incluye memoria validación + decisiones + grafo). */
  promptAppendix: string;
  /** Rutas de archivo a priorizar en selectContextFiles. */
  priorityPaths: string[];
  meta: {
    ms: number;
    validationHints: number;
    decisions: number;
    graphNodes: number;
    graphEdges: number;
    neighborExpansion: number;
  };
};

export type ProjectDecisionRow = {
  title: string;
  body: string;
  tags: string[];
  source: string;
  created_at: string;
};

export type ImportGraphEdge = {
  from: string;
  to: string;
  kind: "imports" | "depends_on";
};

export type ImportGraph = {
  nodes: Set<string>;
  edges: ImportGraphEdge[];
  /** out[path] = paths this file imports */
  outbound: Map<string, string[]>;
  /** in[path] = paths that import this file */
  inbound: Map<string, string[]>;
};
