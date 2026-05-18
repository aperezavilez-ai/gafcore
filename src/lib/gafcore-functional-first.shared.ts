/**
 * FUNCTIONAL-FIRST — reglas compartidas (cliente + servidor).
 * Prioridad: Funcionalidad > UI > estética
 */

export const FUNCTIONAL_FIRST_BUILD_PREFIX =
  "[FUNCTIONAL-FIRST] Interpreta la intención funcional (no solo visual). Entrega flujo completo: estado, handlers, persistencia (useState + localStorage o capa api/ si aplica), loading/error, feedback visible. Prohibido botones/forms decorativos. ";

export type FunctionalAuditIssue = {
  severity: "error" | "warn";
  file: string;
  message: string;
};

export type FunctionalAuditResult = {
  ok: boolean;
  issues: FunctionalAuditIssue[];
};

function stripCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/`(?:\\.|[^`\\])*`/g, "``");
}

function countMatches(text: string, re: RegExp): number {
  const m = text.match(re);
  return m ? m.length : 0;
}

/** Auditoría heurística post-generación (no sustituye revisión humana). */
export function auditFunctionalFirst(
  files: Array<{ name: string; content: string }>,
): FunctionalAuditResult {
  const issues: FunctionalAuditIssue[] = [];

  for (const f of files) {
    if (!/\.(tsx|jsx)$/i.test(f.name)) continue;
    const raw = f.content;
    const code = stripCommentsAndStrings(raw);

    const buttonTags = countMatches(code, /<button\b/gi);
    const buttonClicks = countMatches(code, /\bonClick\s*=/gi);
    if (buttonTags > buttonClicks + 1) {
      issues.push({
        severity: "warn",
        file: f.name,
        message: `Hay ~${buttonTags} <button> pero pocos onClick; revisa handlers.`,
      });
    }

    const formTags = countMatches(code, /<form\b/gi);
    const formSubmit = countMatches(code, /\bonSubmit\s*=/gi);
    if (formTags > 0 && formSubmit < formTags) {
      issues.push({
        severity: "error",
        file: f.name,
        message: "Formulario sin onSubmit conectado.",
      });
    }

    if (/href\s*=\s*["']#["']/i.test(code) || /href\s*=\s*["']\s*["']/i.test(code)) {
      issues.push({
        severity: "warn",
        file: f.name,
        message: "Enlace con href vacío o # sin acción.",
      });
    }

    if (/\bonClick\s*=\s*\{\s*\(\)\s*=>\s*\{\s*\}\s*\}/.test(code)) {
      issues.push({
        severity: "error",
        file: f.name,
        message: "onClick vacío (sin funcionalidad).",
      });
    }

    if (/\bTODO\b|\bFIXME\b/.test(code)) {
      issues.push({
        severity: "warn",
        file: f.name,
        message: "Contiene TODO/FIXME en flujo principal.",
      });
    }

    const needsState =
      /carrito|cart|checkout|login|registro|formulario|guardar|añadir|agregar|comprar|filtro|buscar/i.test(
        raw,
      );
    const hasState = /\buseState\b/.test(code);
    if (needsState && !hasState && buttonTags + formTags > 2) {
      issues.push({
        severity: "warn",
        file: f.name,
        message: "Feature interactiva sin useState; añade estado y handlers.",
      });
    }

    const needsPersistence = /guardar|persist|carrito|pedido|checkout|registro/i.test(raw);
    const hasPersistence =
      /\blocalStorage\b/.test(code) ||
      /\bsessionStorage\b/.test(code) ||
      /\/api\//i.test(code) ||
      /\bfetch\s*\(/.test(code);
    if (needsPersistence && !hasPersistence) {
      issues.push({
        severity: "warn",
        file: f.name,
        message: "Acción de guardado/pedido sin persistencia (localStorage o fetch).",
      });
    }
  }

  const hasErrors = issues.some((i) => i.severity === "error");
  return { ok: !hasErrors, issues };
}

export function formatFunctionalAuditForUser(issues: FunctionalAuditIssue[]): string {
  if (issues.length === 0) return "";
  return issues
    .slice(0, 6)
    .map((i) => `${i.file}: ${i.message}`)
    .join("\n");
}

export function hasFunctionalBlockingIssues(issues: FunctionalAuditIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

/** Instrucción para un único reintento automático tras fallar la auditoría. */
export function buildFunctionalFixInstruction(
  issues: FunctionalAuditIssue[],
  originalUserRequest: string,
): string {
  const list = issues
    .slice(0, 8)
    .map((i) => `- [${i.severity}] ${i.file}: ${i.message}`)
    .join("\n");
  return `[FUNCTIONAL-FIRST CORRECCIÓN] La entrega anterior no cumple. Corrige solo archivos necesarios (delta):
${list}
Pedido original: ${originalUserRequest.slice(0, 500)}
Obligatorio: onClick/onSubmit reales, useState, localStorage o capa lib/store.ts si hay datos. Sin TODO en el flujo principal.`;
}
