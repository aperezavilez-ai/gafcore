/**
 * Edición incremental — snapshot, preservación de estructura y validación pre-preview.
 * Evita "Script error" tras varios turnos cuando la IA pierde componentes o imports.
 */
import type { ProjFile } from "@/lib/gafcore-chat.shared";
export type { ProjFile };
import { isSubstantiveBuildRequest } from "@/lib/gafcore-chat-intent.shared";
import { isReplacingWelcomeApp } from "@/lib/gafcore-project-stale.shared";
import { autoFixSyntaxClosure } from "@/lib/gafcore-integrity-shield.shared";

export const GAFCORE_STRUCTURE_PRESERVATION_RULE = `
[REGLA DE ORO — PRESERVACIÓN DE ESTRUCTURA]
- NUNCA elimines componentes, secciones, formularios ni archivos existentes salvo petición EXPLÍCITA del usuario ("quita", "elimina", "borra").
- Técnica obligatoria: REESCRITURA INCREMENTAL — parchea o extiende; si reescribes un archivo, conserva TODA la funcionalidad y exports previos más lo nuevo.
- En "files" devuelve SOLO deltas (archivos tocados), pero cada archivo modificado debe incluir su contenido COMPLETO y coherente con el snapshot.
- No reduzcas App.tsx a un placeholder ni elimines imports de lucide-react que sigan usándose en JSX.
- Si el snapshot lista componentes, deben seguir existiendo (mismo nombre de export o archivo) tras tu cambio.
`.trim();

export type GafcoreCodeSnapshot = {
  at: number;
  fileCount: number;
  paths: string[];
  componentNames: string[];
  componentPaths: string[];
  fingerprint: string;
};

export type IncrementalEditSession = {
  snapshot: GafcoreCodeSnapshot;
  promptAppend: string;
  priorityPaths: string[];
  active: boolean;
};

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
}

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return h >>> 0;
}

export function createCodeSnapshot(files: ProjFile[]): GafcoreCodeSnapshot {
  const paths = files.map((f) => normalizePath(f.name)).sort();
  const componentPaths: string[] = [];
  const componentNames = new Set<string>();

  for (const f of files) {
    if (!/\.(tsx|jsx)$/i.test(f.name)) continue;
    const n = normalizePath(f.name);
    if (/components\//i.test(n) || /^app\.(tsx|jsx)$/i.test(n)) {
      componentPaths.push(n);
    }
    for (const name of extractExportedComponentNames(f.content)) {
      componentNames.add(name);
    }
  }

  const fingerprint = paths
    .map((p) => {
      const file = files.find((f) => normalizePath(f.name) === p);
      const head = file?.content.slice(0, 800) ?? "";
      return `${p}:${file?.content.length ?? 0}:${djb2(head)}`;
    })
    .join("|");

  return {
    at: Date.now(),
    fileCount: files.length,
    paths,
    componentNames: [...componentNames].sort(),
    componentPaths: [...new Set(componentPaths)].sort(),
    fingerprint,
  };
}

export function extractExportedComponentNames(content: string): string[] {
  const names: string[] = [];
  const re =
    /export\s+(?:default\s+)?(?:function|const|class)\s+([A-Z][A-Za-z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    if (m[1]) names.push(m[1]);
  }
  return names;
}

function stripForJsxAudit(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/`(?:\\.|[^`\\])*`/g, "``");
}

/** Balance aproximado de tags JSX (0 = equilibrado). Respeta tags autocerrados `/>`. */
export function auditJsxTagBalance(content: string): number {
  const code = stripForJsxAudit(content);
  const voidTags = new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr",
  ]);
  let open = 0;
  let close = 0;
  const tagRe = /<\/?([A-Za-z][A-Za-z0-9.-]*)(?:\s[^>]*)?\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(code)) !== null) {
    const full = m[0];
    const name = m[1];
    if (full.startsWith("</")) {
      close++;
      continue;
    }
    if (full.endsWith("/>") || voidTags.has(name.toLowerCase())) continue;
    open++;
  }
  return open - close;
}

type ParsedImport = { line: string; names: string[]; from: string };

function parseImportLine(line: string): ParsedImport | null {
  const m = line.match(
    /import\s+(?:type\s+)?(?:\{([^}]+)\}|(\w+))\s+from\s+['"]([^'"]+)['"]/,
  );
  if (!m) return null;
  const from = m[3];
  const names = m[1]
    ? m[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean)
    : m[2]
      ? [m[2].trim()]
      : [];
  return { line: line.trim(), names, from };
}

function extractImportLines(source: string): ParsedImport[] {
  const out: ParsedImport[] = [];
  for (const line of source.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("import ")) continue;
    const p = parseImportLine(t);
    if (p) out.push(p);
  }
  return out;
}

function symbolUsedInBody(name: string, body: string): boolean {
  if (/<[A-Z]/.test(name) || /^[A-Z]/.test(name)) {
    return new RegExp(`<${name}\\b`).test(body);
  }
  return new RegExp(`\\b${name}\\b`).test(body);
}

/** Restaura líneas import del baseline si el símbolo se usa pero falta el import. */
export function restoreImportsInFile(content: string, baselineContent: string): string {
  const baselineImports = extractImportLines(baselineContent);
  const currentLines = new Set(extractImportLines(content).map((i) => i.line));
  const toPrepend: string[] = [];

  for (const imp of baselineImports) {
    if (currentLines.has(imp.line)) continue;
    if (imp.names.some((n) => symbolUsedInBody(n, content))) {
      toPrepend.push(imp.line);
    }
  }

  if (toPrepend.length === 0) return content;
  const body = content.replace(/^(?:import\s+[^\n]+\n)+/, "");
  const kept = extractImportLines(content).map((i) => i.line);
  const lines = [...new Set([...toPrepend, ...kept])];
  return `${lines.join("\n")}\n${body.trimStart()}`;
}

function pathStem(path: string): string {
  return normalizePath(path).replace(/\.(tsx|jsx)$/i, "");
}

function isComponentFileReferenced(
  filePath: string,
  files: ProjFile[],
): boolean {
  const stem = pathStem(filePath);
  const base = stem.split("/").pop() ?? stem;
  const donor = files.find((f) => normalizePath(f.name) === normalizePath(filePath));
  const exported = donor ? extractExportedComponentNames(donor.content) : [];

  for (const f of files) {
    if (normalizePath(f.name) === normalizePath(filePath)) continue;
    const c = f.content;
    if (
      new RegExp(`from\\s+['"]\\.?/?${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"]`).test(c) ||
      new RegExp(`from\\s+['"][^'"]*${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}['"]`).test(c)
    ) {
      return true;
    }
    for (const name of exported) {
      if (symbolUsedInBody(name, c)) return true;
    }
  }
  return false;
}

export function mergeIncrementalDelta(baseline: ProjFile[], delta: ProjFile[]): ProjFile[] {
  if (delta.length === 0) return baseline;
  const map = new Map(baseline.map((f) => [normalizePath(f.name), { ...f, name: normalizePath(f.name) }]));
  for (const f of delta) {
    const n = normalizePath(f.name);
    map.set(n, { ...f, name: n });
  }
  return [...map.values()];
}

export function restoreDeletedComponentFiles(
  baseline: ProjFile[],
  merged: ProjFile[],
): ProjFile[] {
  const mergedSet = new Set(merged.map((f) => normalizePath(f.name)));
  const restored: ProjFile[] = [...merged];
  for (const f of baseline) {
    const n = normalizePath(f.name);
    if (mergedSet.has(n)) continue;
    if (!/\.(tsx|jsx)$/i.test(n)) continue;
    if (isComponentFileReferenced(n, merged)) {
      restored.push({ ...f, name: n });
      mergedSet.add(n);
    }
  }
  return restored;
}

export type PreRenderHealResult = {
  files: ProjFile[];
  healed: boolean;
  notes: string[];
};

/**
 * Validación pre-preview: tags cerrados + imports declarados vs snapshot.
 */
export function validateAndHealBeforePreview(
  baseline: ProjFile[],
  merged: ProjFile[],
  snapshot: GafcoreCodeSnapshot,
): PreRenderHealResult {
  const notes: string[] = [];
  let healed = false;
  const baselineMap = new Map(baseline.map((f) => [normalizePath(f.name), f]));
  let files = restoreDeletedComponentFiles(baseline, merged);

  const out = files.map((f) => {
    if (!/\.(tsx|jsx)$/i.test(f.name)) return f;
    const base = baselineMap.get(normalizePath(f.name));
    let content = f.content;

    if (base && isReplacingWelcomeApp(base.content, content)) {
      return f;
    }

    if (base) {
      const before = content;
      content = restoreImportsInFile(content, base.content);
      if (content !== before) {
        healed = true;
        notes.push(`imports restaurados en ${f.name}`);
      }
    }

    const balance = auditJsxTagBalance(content);
    const baseBalance = base ? auditJsxTagBalance(base.content) : 0;
    if (balance !== 0 && base && baseBalance === 0) {
      const fixed = autoFixSyntaxClosure(content);
      if (fixed.fixes.length > 0 && auditJsxTagBalance(fixed.content) === 0) {
        content = fixed.content;
        healed = true;
        notes.push(`sintaxis autocorregida en ${f.name}`);
      } else {
        const shrunk = content.length < base.content.length * 0.55;
        if (shrunk || balance <= -1 || balance >= 2) {
          content = restoreImportsInFile(base.content, base.content);
          healed = true;
          notes.push(`estructura JSX restaurada desde snapshot en ${f.name}`);
        }
      }
    }

    return { ...f, content };
  });

  for (const name of snapshot.componentNames) {
    const stillExported = out.some((f) => extractExportedComponentNames(f.content).includes(name));
    const referenced = out.some((f) => symbolUsedInBody(name, f.content));
    if (referenced && !stillExported) {
      const donor = baseline.find((b) => extractExportedComponentNames(b.content).includes(name));
      if (donor && !out.some((x) => normalizePath(x.name) === normalizePath(donor.name))) {
        out.push({ ...donor, name: normalizePath(donor.name) });
        healed = true;
        notes.push(`componente ${name} reinyectado desde snapshot`);
      }
    }
  }

  return { files: out, healed, notes };
}

export function buildIncrementalContextNote(snapshot: GafcoreCodeSnapshot): string {
  if (snapshot.fileCount < 2) return "";
  const comps =
    snapshot.componentNames.length > 0
      ? snapshot.componentNames.slice(0, 24).join(", ")
      : "(sin exports detectados)";
  return (
    `\n[SNAPSHOT PRE-EDICIÓN @${snapshot.at}] Archivos: ${snapshot.fileCount}. ` +
    `Componentes/exportaciones a preservar: ${comps}. ` +
    `Rutas clave: ${snapshot.componentPaths.slice(0, 12).join(", ") || "App.tsx"}.`
  );
}

export function prepareIncrementalEditSession(
  files: ProjFile[],
  instruction: string,
): IncrementalEditSession {
  const snapshot = createCodeSnapshot(files);
  const active = isSubstantiveBuildRequest(instruction) && snapshot.fileCount >= 2;
  const priorityPaths = active
    ? [
        ...snapshot.componentPaths,
        ...snapshot.paths.filter((p) => /^app\.(tsx|jsx)$/i.test(p) || /^main\.(tsx|jsx)$/i.test(p)),
        "package.json",
        "index.html",
      ]
    : [];

  const promptAppend = active
    ? `${GAFCORE_STRUCTURE_PRESERVATION_RULE}${buildIncrementalContextNote(snapshot)}`
    : "";

  return { snapshot, promptAppend, priorityPaths: [...new Set(priorityPaths)], active };
}

export function applyIncrementalEditPersistence(
  baseline: ProjFile[],
  aiDelta: ProjFile[],
  session: IncrementalEditSession,
): { files: ProjFile[]; heal: PreRenderHealResult } {
  if (!session.active || aiDelta.length === 0) {
    return {
      files: aiDelta.length > 0 ? mergeIncrementalDelta(baseline, aiDelta) : baseline,
      heal: { files: baseline, healed: false, notes: [] },
    };
  }
  const merged = mergeIncrementalDelta(baseline, aiDelta);
  const heal = validateAndHealBeforePreview(baseline, merged, session.snapshot);
  return { files: heal.files, heal };
}
