import type { ProjFile } from "@/lib/gafcore-chat.shared";
import type { ImportGraph, ImportGraphEdge } from "@/memory/types";

const IMPORT_RE =
  /(?:import|export)\s+(?:type\s+)?(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

const CODE_EXT = /\.(tsx?|jsx?|mjs|cjs)$/i;

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

function dirname(filePath: string): string {
  const i = filePath.lastIndexOf("/");
  return i <= 0 ? "" : filePath.slice(0, i);
}

function resolveImport(fromFile: string, spec: string, known: Set<string>): string | null {
  if (spec.startsWith("http://") || spec.startsWith("https://")) return null;
  if (!spec.startsWith(".") && !spec.startsWith("/")) {
    return null;
  }
  let base = spec;
  if (base.startsWith("/")) base = base.slice(1);
  else base = normalizePath(dirname(fromFile) ? `${dirname(fromFile)}/${spec}` : spec);

  const candidates = [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    `${base}.jsx`,
    `${base}.js`,
    `${base}/index.tsx`,
    `${base}/index.ts`,
    `${base}/index.jsx`,
    `${base}/index.js`,
  ];
  for (const c of candidates) {
    if (known.has(c)) return c;
  }
  return null;
}

function hashContent(s: string): string {
  let h = 0;
  for (let i = 0; i < Math.min(s.length, 8000); i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return `c:${Math.abs(h).toString(36)}`;
}

/** Construye grafo de imports entre archivos del proyecto (heurística, sin TS program). */
export function buildImportGraph(files: ProjFile[]): ImportGraph {
  const codeFiles = files.filter((f) => CODE_EXT.test(f.name));
  const known = new Set(codeFiles.map((f) => normalizePath(f.name)));
  const edges: ImportGraphEdge[] = [];
  const outbound = new Map<string, string[]>();
  const inbound = new Map<string, string[]>();

  for (const file of codeFiles) {
    const from = normalizePath(file.name);
    const found = new Set<string>();
    let m: RegExpExecArray | null;
    IMPORT_RE.lastIndex = 0;
    while ((m = IMPORT_RE.exec(file.content))) {
      const spec = m[1] || m[2];
      if (!spec) continue;
      const to = resolveImport(from, spec, known);
      if (!to || found.has(to)) continue;
      found.add(to);
      edges.push({ from, to, kind: "imports" });
      if (!outbound.has(from)) outbound.set(from, []);
      outbound.get(from)!.push(to);
      if (!inbound.has(to)) inbound.set(to, []);
      inbound.get(to)!.push(from);
    }
  }

  for (const f of files) {
    if (/package\.json$/i.test(f.name)) {
      try {
        const pkg = JSON.parse(f.content) as { dependencies?: Record<string, string> };
        for (const dep of Object.keys(pkg.dependencies ?? {})) {
          edges.push({ from: "package.json", to: `npm:${dep}`, kind: "depends_on" });
        }
      } catch {
        /* ignore */
      }
    }
  }

  return {
    nodes: known,
    edges,
    outbound,
    inbound,
  };
}

/** Archivos relacionados por imports (vecinos) hasta `depth` saltos. */
export function expandGraphNeighbors(
  graph: ImportGraph,
  seedPaths: string[],
  depth = 2,
): string[] {
  const out = new Set<string>();
  let frontier = seedPaths
    .map(normalizePath)
    .filter((p) => graph.nodes.has(p));

  for (let d = 0; d < depth && frontier.length > 0; d++) {
    const next: string[] = [];
    for (const path of frontier) {
      out.add(path);
      const related = [
        ...(graph.outbound.get(path) ?? []),
        ...(graph.inbound.get(path) ?? []),
      ];
      for (const r of related) {
        if (!out.has(r) && graph.nodes.has(r)) next.push(r);
      }
    }
    frontier = next;
  }
  return [...out];
}

/** Rutas semilla desde la instrucción del usuario (tokens + App/main). */
export function seedPathsFromInstruction(
  instruction: string,
  files: ProjFile[],
): string[] {
  const inst = instruction.toLowerCase();
  const tokens = [...new Set(inst.split(/[^a-z0-9áéíóúñ_/.\-]+/gi).filter((t) => t.length > 2))];
  const seeds = new Set<string>();

  for (const f of files) {
    const n = f.name.toLowerCase();
    if (/app\.(tsx|jsx)$/i.test(f.name) || /main\.(tsx|jsx|ts|js)$/i.test(f.name)) {
      seeds.add(normalizePath(f.name));
    }
    for (const t of tokens) {
      if (t && n.includes(t)) seeds.add(normalizePath(f.name));
    }
  }
  return [...seeds];
}

export function contentHashForFile(file: ProjFile): string {
  return hashContent(file.content);
}
