/**
 * Escudo de Integridad GafCore — anti Script Error en ediciones sucesivas.
 * Análisis de impacto, preservación de imports/hooks/types, cierre sintáctico, layout raíz.
 */
import { buildImportGraph, expandGraphNeighbors } from "@/memory/import-graph.shared";
import {
  auditJsxTagBalance,
  extractExportedComponentNames,
  restoreDeletedComponentFiles,
  restoreImportsInFile,
  type GafcoreCodeSnapshot,
  type ProjFile,
} from "@/lib/gafcore-incremental-edit.shared";
import { isReplacingWelcomeApp } from "@/lib/gafcore-project-stale.shared";
import { GAFCORE_LIB_STORE_TS } from "@/lib/gafcore-templates.shared";

export const GAFCORE_INTEGRITY_SHIELD_RULE = `
[ESCUDO DE INTEGRIDAD — REGLAS DE HIERRO]
1) ANÁLISIS DE IMPACTO: Antes de editar, revisa el árbol de imports/componentes del contexto. Si tocas un hijo, no rompas dependencias del padre.
2) PROHIBICIÓN DE ELIMINACIÓN: NO elimines imports, \`import type\`, hooks (useState, useEffect, useMemo, useCallback, useRef) ni tipos/interfaces que ya existan, salvo que el usuario pida explícitamente quitar/eliminar/borrar.
3) INCREMENTAL: Añade funcionalidad extendiendo código; cada archivo modificado debe ser el contenido COMPLETO del archivo, no un fragmento incompleto.
4) CIERRE OBLIGATORIO: Antes de responder, cuenta manualmente: por cada \`{\` debe haber un \`}\`. Por cada tag JSX abierto \`<Tag\` debe haber \`</Tag>\` o \`/>\`. Si no coinciden, corrige ANTES de responder. NO es aceptable enviar código con desbalances. Aplica a TODOS los archivos (App.tsx, lib/*, components/*). UN SOLO desbalance en CUALQUIER archivo rompe toda la app.
5) LAYOUT RAÍZ: Si el cambio es en un componente hijo (components/*), NO reescribas App.tsx/layout padre salvo que el usuario lo pida. Mantén la estructura del padre intacta.
6) ANTI-CRASH: No devuelvas componentes que retornen \`undefined\`; usa \`null\` o JSX vacío con mensaje. Accede a props con optional chaining cuando duden.
7) ARCHIVOS SECUNDARIOS: lib/store.ts, lib/utils.ts, components/*.tsx y cualquier archivo auxiliar deben tener la misma precisión sintáctica que App.tsx. No son menos importantes.
8) lib/store.ts: PROHIBIDO genéricos \`<T>\` en strings o cuerpo de funciones. \`saveJson\` = \`localStorage.setItem(key, JSON.stringify(value))\` sin \`</T>\` ni \`<T>\` en esa línea.
9) GENERACIÓN DESDE CERO: Cuando generes archivos nuevos, usa estructuras simples y directas. Evita ternarios anidados dentro de JSX return(). Prefiere variables auxiliares antes del return para lógica compleja.
`.trim();

export type SyntaxClosureAudit = {
  ok: boolean;
  braceDelta: number;
  parenDelta: number;
  jsxTagDelta: number;
  messages: string[];
};

export type ImpactAnalysis = {
  touchedPaths: string[];
  dependentParents: string[];
  dependentChildren: string[];
  summaryForPrompt: string;
};

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
}

/** Auditoría de cierre { } ( ) y tags JSX. */
export function auditSyntaxClosure(content: string): SyntaxClosureAudit {
  const stripped = content
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/`(?:\\.|[^`\\])*`/g, "``");

  const openBrace = (stripped.match(/\{/g) ?? []).length;
  const closeBrace = (stripped.match(/\}/g) ?? []).length;
  const openParen = (stripped.match(/\(/g) ?? []).length;
  const closeParen = (stripped.match(/\)/g) ?? []).length;
  const jsxTagDelta = auditJsxTagBalance(content);
  const braceDelta = openBrace - closeBrace;
  const parenDelta = openParen - closeParen;

  const messages: string[] = [];
  if (braceDelta !== 0) messages.push(`llaves desbalanceadas (${braceDelta > 0 ? "faltan }" : "sobran }"})`);
  if (parenDelta !== 0) messages.push(`paréntesis desbalanceados (${parenDelta > 0 ? "faltan )" : "sobran )"})`);
  if (jsxTagDelta !== 0) messages.push(`tags JSX desbalanceados (${jsxTagDelta})`);

  const ok = messages.length === 0;
  return { ok, braceDelta, parenDelta, jsxTagDelta, messages };
}

const JSX_VOID_TAGS = new Set([
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

function stripForJsxFix(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/`(?:\\.|[^`\\])*`/g, "``");
}

/** Pila de tags JSX abiertos sin cerrar (orden de apertura). */
function collectUnclosedJsxTags(content: string): string[] {
  const code = stripForJsxFix(content);
  const stack: string[] = [];
  const tagRe = /<\/?([A-Za-z][A-Za-z0-9.-]*)(?:\s[^>]*)?\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(code)) !== null) {
    const full = m[0];
    const name = m[1];
    if (full.startsWith("</")) {
      const idx = stack.lastIndexOf(name);
      if (idx >= 0) stack.splice(idx, 1);
      continue;
    }
    if (full.endsWith("/>") || JSX_VOID_TAGS.has(name.toLowerCase())) continue;
    stack.push(name);
  }
  return stack;
}

function fixBraceBalance(content: string, delta: number): string {
  if (delta === 0) return content;
  if (delta > 0) return `${content.trimEnd()}\n${"}".repeat(delta)}\n`;
  let out = content.trimEnd();
  let remaining = -delta;
  while (remaining > 0 && /\}\s*$/.test(out)) {
    out = out.replace(/\}\s*$/, "").trimEnd();
    remaining--;
  }
  return out.endsWith("\n") ? out : `${out}\n`;
}

function fixParenBalance(content: string, delta: number): string {
  if (delta === 0) return content;
  if (delta > 0) {
    const insertAt = content.lastIndexOf(";");
    if (insertAt > 0) {
      return `${content.slice(0, insertAt)}${")".repeat(delta)}${content.slice(insertAt)}`;
    }
    return `${content.trimEnd()}${")".repeat(delta)}\n`;
  }
  let out = content.trimEnd();
  let remaining = -delta;
  while (remaining > 0 && /\)\s*$/.test(out)) {
    out = out.replace(/\)\s*$/, "").trimEnd();
    remaining--;
  }
  return out.endsWith("\n") ? out : `${out}\n`;
}

function insertBeforeReturnClose(content: string, insertion: string): string {
  const returnClose = content.lastIndexOf(");");
  if (returnClose > 0) {
    return `${content.slice(0, returnClose)}${insertion}${content.slice(returnClose)}`;
  }
  const lastBrace = content.lastIndexOf("}");
  if (lastBrace > 0) {
    return `${content.slice(0, lastBrace)}${insertion}${content.slice(lastBrace)}`;
  }
  return `${content.trimEnd()}${insertion}\n`;
}

function fixJsxTagBalance(content: string, delta: number): string {
  if (delta === 0) return content;
  if (delta > 0) {
    const unclosed = collectUnclosedJsxTags(content);
    const tagsToClose =
      unclosed.length >= delta ? unclosed.slice(-delta) : unclosed;
    if (tagsToClose.length === 0) {
      return `${content.trimEnd()}\n${"</div>".repeat(delta)}\n`;
    }
    const closers = [...tagsToClose].reverse().map((t) => `</${t}>`).join("");
    return insertBeforeReturnClose(content, closers);
  }
  let out = fixJsxSurplusClosers(content).content;
  let remaining = -delta;
  while (remaining > 0) {
    const m = out.match(/<\/([A-Za-z][A-Za-z0-9.-]*)>\s*$/);
    if (!m) break;
    out = out.slice(0, m.index).trimEnd();
    remaining--;
  }
  return out.endsWith("\n") ? out : `${out}\n`;
}

/** Elimina cierres JSX huérfanos (p. ej. `</Carrito></header>` tras cerrar el return). */
export function fixJsxSurplusClosers(content: string): { content: string; removed: number } {
  const tagRe = /<\/?([A-Za-z][A-Za-z0-9.-]*)(?:\s[^>/]*)?\/?>/g;
  const orphans: { start: number; end: number }[] = [];
  const stack: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(content)) !== null) {
    const full = m[0];
    const name = m[1];
    const start = m.index;
    const end = start + full.length;
    if (full.startsWith("</")) {
      const idx = stack.lastIndexOf(name);
      if (idx >= 0) stack.splice(idx, 1);
      else orphans.push({ start, end });
      continue;
    }
    if (full.endsWith("/>") || JSX_VOID_TAGS.has(name.toLowerCase())) continue;
    stack.push(name);
  }
  if (orphans.length === 0) return { content, removed: 0 };
  let out = content;
  for (const o of orphans.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, o.start) + out.slice(o.end);
  }
  return { content: out, removed: orphans.length };
}

/**
 * Intenta autocorregir desbalances de llaves, paréntesis y tags JSX.
 * Devuelve el contenido corregido y notas de lo aplicado.
 */
export function autoFixSyntaxClosure(content: string): { content: string; fixes: string[] } {
  const fixes: string[] = [];
  let out = content;
  const surplus = fixJsxSurplusClosers(out);
  if (surplus.removed > 0) {
    out = surplus.content;
    fixes.push(`eliminados ${surplus.removed} cierre(s) JSX huérfano(s)`);
  }
  let audit = auditSyntaxClosure(out);
  let guard = 0;

  while (!audit.ok && guard < 8) {
    guard++;
    const prev = out;
    if (audit.braceDelta !== 0) {
      out = fixBraceBalance(out, audit.braceDelta);
      fixes.push(
        audit.braceDelta > 0
          ? `añadidas ${audit.braceDelta} llave(s) de cierre`
          : `eliminadas ${-audit.braceDelta} llave(s) sobrante(s)`,
      );
    }
    if (audit.parenDelta !== 0) {
      out = fixParenBalance(out, audit.parenDelta);
      fixes.push(
        audit.parenDelta > 0
          ? `añadidos ${audit.parenDelta} paréntesis de cierre`
          : `eliminados ${-audit.parenDelta} paréntesis sobrante(s)`,
      );
    }
    if (audit.jsxTagDelta !== 0) {
      out = fixJsxTagBalance(out, audit.jsxTagDelta);
      fixes.push(
        audit.jsxTagDelta > 0
          ? `cerrados ${audit.jsxTagDelta} tag(s) JSX pendiente(s)`
          : `eliminados ${-audit.jsxTagDelta} cierre(s) JSX sobrante(s)`,
      );
    }
    if (out === prev) break;
    audit = auditSyntaxClosure(out);
  }

  return { content: out, fixes };
}

const CANONICAL_SAVE_JSON_FN = `export function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}`;

/** Corrige lib/store.ts cuando la IA inserta </T> o genéricos rotos en saveJson. */
export function healLibStoreTs(content: string): { content: string; fixes: string[] } {
  const fixes: string[] = [];
  let out = content;

  if (/JSON\.stringify\([^)]+\)\s*<\/T>/i.test(out)) {
    out = out.replace(/JSON\.stringify\(([^)]+)\)\s*<\/T>/gi, "JSON.stringify($1)");
    fixes.push("eliminado </T> erróneo tras JSON.stringify");
  }

  if (/export function saveJson\s*<[^>]+>/.test(out)) {
    out = out.replace(/export function saveJson[\s\S]*?\n\}/, CANONICAL_SAVE_JSON_FN);
    fixes.push("saveJson normalizado sin genéricos en el cuerpo");
  }

  if (/export function loadJson\s*</.test(out)) {
    const loadFn = GAFCORE_LIB_STORE_TS.match(/export function loadJson[\s\S]*?\n\}/)?.[0];
    if (loadFn) {
      out = out.replace(/export function loadJson[\s\S]*?\n\}/, loadFn);
      fixes.push("loadJson normalizado sin genéricos");
    }
  }

  return { content: out, fixes };
}

/** Grafo de dependencias antes de aplicar un delta. */
export function analyzeEditImpact(
  files: ProjFile[],
  deltaPaths: string[],
  instruction: string,
): ImpactAnalysis {
  const graph = buildImportGraph(files);
  const touched = deltaPaths.map(normalizePath).filter(Boolean);
  const parents = new Set<string>();
  const children = new Set<string>();

  for (const path of touched) {
    for (const edge of graph.edges) {
      if (edge.to === path) parents.add(edge.from);
      if (edge.from === path) children.add(edge.to);
    }
    expandGraphNeighbors(graph, [path], 1).forEach((p) => {
      if (p !== path) children.add(p);
    });
  }

  const dependentParents = [...parents].filter((p) => !touched.includes(p)).slice(0, 12);
  const dependentChildren = [...children].filter((p) => !touched.includes(p)).slice(0, 12);

  const summaryForPrompt =
    touched.length > 0
      ? `\n[ANÁLISIS DE IMPACTO] Archivos a modificar: ${touched.join(", ")}. ` +
        (dependentParents.length
          ? `Padres/importadores: ${dependentParents.join(", ")} — no romper sus imports. `
          : "") +
        (dependentChildren.length
          ? `Hijos relacionados: ${dependentChildren.join(", ")}. `
          : "") +
        (/(componente|hero|card|botón|sección|navbar|footer)/i.test(instruction) &&
        !/app\.tsx|layout completo|página entera/i.test(instruction)
          ? "Cambio local: NO reescribir App.tsx padre. "
          : "")
      : "";

  return {
    touchedPaths: touched,
    dependentParents,
    dependentChildren,
    summaryForPrompt,
  };
}

const HOOK_RE = /\b(use[A-Z][A-Za-z0-9]*)\b/g;
const TYPE_IMPORT_RE =
  /import\s+type\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g;

function extractHooksUsed(content: string): Set<string> {
  const s = new Set<string>();
  let m: RegExpExecArray | null;
  HOOK_RE.lastIndex = 0;
  while ((m = HOOK_RE.exec(content))) {
    if (m[1]?.startsWith("use")) s.add(m[1]);
  }
  return s;
}

function extractTypeImportLines(content: string): string[] {
  const lines: string[] = [];
  for (const line of content.split("\n")) {
    if (/^\s*import\s+type\s+/.test(line)) lines.push(line.trim());
  }
  return lines;
}

/** Restaura hooks y import type del baseline si siguen usados en el cuerpo. */
export function restoreHooksAndTypesInFile(content: string, baselineContent: string): string {
  let out = restoreImportsInFile(content, baselineContent);

  const baselineHooks = extractHooksUsed(baselineContent);
  const currentHooks = extractHooksUsed(out);
  const bodyHooks = extractHooksUsed(out);
  const missingHooks = [...baselineHooks].filter(
    (h) => bodyHooks.has(h) && !currentHooks.has(h),
  );

  if (missingHooks.length > 0 && !/\bfrom\s+['"]react['"]/.test(out)) {
    out = `import { ${[...new Set([...missingHooks, "useState"])].join(", ")} } from "react";\n${out}`;
  } else if (missingHooks.length > 0) {
    const reactImp = out.match(/import\s+\{([^}]+)\}\s+from\s+['"]react['"]/);
    if (reactImp) {
      const names = new Set(
        reactImp[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean),
      );
      for (const h of missingHooks) names.add(h);
      out = out.replace(reactImp[0], `import { ${[...names].join(", ")} } from "react"`);
    }
  }

  const baselineTypes = extractTypeImportLines(baselineContent);
  const currentSet = new Set(extractTypeImportLines(out));
  const toAdd = baselineTypes.filter((l) => !currentSet.has(l));
  if (toAdd.length > 0) {
    const impBlock = out.match(/^(?:import\s+[^\n]+\n)+/);
    const rest = impBlock ? out.slice(impBlock[0].length) : out;
    out = `${impBlock?.[0] ?? ""}${toAdd.join("\n")}\n${rest.trimStart()}`;
  }

  return out;
}

/** Si solo debían cambiar hijos, restaura App/layout padre desde baseline. */
export function protectRootLayoutWhenChildEdit(
  baseline: ProjFile[],
  merged: ProjFile[],
  deltaPaths: string[],
  instruction: string,
): { files: ProjFile[]; protected: boolean } {
  const touched = deltaPaths.map(normalizePath);
  const childOnlyIntent =
    /(componente|hero|card|botón|sección|navbar|footer|hijo)/i.test(instruction) &&
    !/(app\.tsx|layout|página entera|rehacer app|reescribir app)/i.test(instruction);
  const onlyComponentPaths =
    touched.length > 0 && touched.every((p) => /components\//i.test(p));
  const touchedApp = touched.some((p) => /^app\.(tsx|jsx)$/i.test(p));

  if (!childOnlyIntent && !(onlyComponentPaths && touchedApp)) {
    return { files: merged, protected: false };
  }

  const baseApp = baseline.find((f) => /^app\.(tsx|jsx)$/i.test(normalizePath(f.name)));
  const mergedApp = merged.find((f) => /^app\.(tsx|jsx)$/i.test(normalizePath(f.name)));
  if (!baseApp || !mergedApp) return { files: merged, protected: false };

  if (isReplacingWelcomeApp(baseApp.content, mergedApp.content)) {
    return { files: merged, protected: false };
  }

  const baseOk = auditSyntaxClosure(baseApp.content).ok;
  const mergedBad = !auditSyntaxClosure(mergedApp.content).ok;
  const shrunk = mergedApp.content.length < baseApp.content.length * 0.65;

  if (baseOk && (mergedBad || shrunk)) {
    return {
      files: merged.map((f) =>
        /^app\.(tsx|jsx)$/i.test(normalizePath(f.name)) ? { ...f, content: baseApp.content } : f,
      ),
      protected: true,
    };
  }
  return { files: merged, protected: false };
}

export type IntegrityShieldResult = {
  files: ProjFile[];
  healed: boolean;
  notes: string[];
};

/**
 * Escudo completo post-IA (pre-preview): impacto + imports/hooks/types + sintaxis + layout.
 */
export function runIntegrityShield(
  baseline: ProjFile[],
  merged: ProjFile[],
  snapshot: GafcoreCodeSnapshot,
  options?: { deltaPaths?: string[]; instruction?: string },
): IntegrityShieldResult {
  const notes: string[] = [];
  let healed = false;
  let files = restoreDeletedComponentFiles(baseline, merged);
  const baselineMap = new Map(baseline.map((f) => [normalizePath(f.name), f]));
  const deltaPaths = options?.deltaPaths ?? merged.map((f) => f.name);

  if (options?.instruction) {
    const layout = protectRootLayoutWhenChildEdit(
      baseline,
      files,
      deltaPaths,
      options.instruction,
    );
    if (layout.protected) {
      files = layout.files;
      healed = true;
      notes.push("App.tsx/layout padre restaurado (edición solo en hijo)");
    }
  }

  files = files.map((f) => {
    if (!/\.(tsx|jsx|ts)$/i.test(f.name)) return f;

    if (/^lib\/store\.ts$/i.test(normalizePath(f.name))) {
      const storeHeal = healLibStoreTs(f.content);
      if (storeHeal.fixes.length > 0) {
        healed = true;
        notes.push(`lib/store.ts: ${storeHeal.fixes.join("; ")}`);
        f = { ...f, content: storeHeal.content };
      }
    }

    const base = baselineMap.get(normalizePath(f.name));
    if (!base) {
      const syntax = auditSyntaxClosure(f.content);
      if (!syntax.ok) {
        const fixed = autoFixSyntaxClosure(f.content);
        const after = auditSyntaxClosure(fixed.content);
        if (after.ok) {
          notes.push(`sintaxis autocorregida en archivo nuevo ${f.name}: ${fixed.fixes.join("; ")}`);
          healed = true;
          return { ...f, content: fixed.content };
        }
        notes.push(`sintaxis inválida en archivo nuevo ${f.name}: ${syntax.messages.join("; ")}`);
      }
      return f;
    }

    if (
      /^app\.(tsx|jsx)$/i.test(normalizePath(f.name)) &&
      isReplacingWelcomeApp(base.content, f.content)
    ) {
      return f;
    }

    let content = restoreHooksAndTypesInFile(f.content, base.content);
    let syntax = auditSyntaxClosure(content);
    const baseSyntax = auditSyntaxClosure(base.content);

    if (!syntax.ok) {
      const fixed = autoFixSyntaxClosure(content);
      if (fixed.fixes.length > 0) {
        content = fixed.content;
        syntax = auditSyntaxClosure(content);
        if (syntax.ok) {
          notes.push(`sintaxis autocorregida en ${f.name}: ${fixed.fixes.join("; ")}`);
          healed = true;
        }
      }
    }

    if (!syntax.ok && baseSyntax.ok) {
      const retry = autoFixSyntaxClosure(content);
      if (retry.fixes.length > 0) {
        content = retry.content;
        syntax = auditSyntaxClosure(content);
        if (syntax.ok) {
          notes.push(`sintaxis reparada en ${f.name} (segundo pase): ${retry.fixes.join("; ")}`);
          healed = true;
        }
      }
      if (!syntax.ok) {
        notes.push(
          `sintaxis parcial en ${f.name} (${syntax.messages.join("; ")}) — se conserva delta IA`,
        );
      }
    }

    if (content !== f.content) healed = true;
    return { ...f, content };
  });

  for (const name of snapshot.componentNames) {
    const stillExported = files.some((f) =>
      extractExportedComponentNames(f.content).includes(name),
    );
    const referenced = files.some((f) => new RegExp(`<${name}\\b`).test(f.content));
    if (referenced && !stillExported) {
      const donor = baseline.find((b) =>
        extractExportedComponentNames(b.content).includes(name),
      );
      if (donor && !files.some((x) => normalizePath(x.name) === normalizePath(donor.name))) {
        files.push({ ...donor, name: normalizePath(donor.name) });
        notes.push(`componente ${name} reinyectado (escudo)`);
        healed = true;
      }
    }
  }

  return { files, healed, notes };
}

export function buildIntegrityShieldPromptAppend(
  files: ProjFile[],
  instruction: string,
  deltaHintPaths?: string[],
): string {
  const impact = analyzeEditImpact(files, deltaHintPaths ?? [], instruction);
  return `${GAFCORE_INTEGRITY_SHIELD_RULE}${impact.summaryForPrompt}`;
}

/** Snippet inyectado en proyectos generados (main/App) — anti white screen. */
export const GAFCORE_ANTI_CRASH_RUNTIME_SNIPPET = `
/** GafCore Anti-Crash — evita white screen si el componente devuelve undefined */
export function gafcoreSafeRender(Component) {
  if (!Component || typeof Component !== "function") {
    return function GafcoreMissing() {
      return null;
    };
  }
  return function GafcoreSafeWrapper(props) {
    try {
      const out = Component(props);
      if (out === undefined) {
        return (
          <div className="rounded-xl border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
            Vista no disponible (undefined). Pide a GafCore que corrija este componente.
          </div>
        );
      }
      return out;
    } catch (e) {
      throw e;
    }
  };
}
`.trim();
