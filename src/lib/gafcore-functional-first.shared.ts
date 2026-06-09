/**
 * FUNCTIONAL-FIRST — reglas compartidas (cliente + servidor).
 * Prioridad: Funcionalidad > UI > estética
 */

export const FUNCTIONAL_FIRST_BUILD_PREFIX =
  "[FUNCTIONAL-FIRST] Interpreta la intención funcional (no solo visual). Entrega flujo completo: estado, handlers, persistencia (useState + localStorage o capa api/ si aplica), loading/error, feedback visible. Prohibido botones/forms decorativos. " +
  "OBLIGATORIO: devuelve files con App.tsx funcional; PROHIBIDO responder solo con plan, fases o arquitectura sin código. " +
  "SINTAXIS OBLIGATORIA: (1) balance {} () </>; (2) todos los imports declarados; (3) sin objetos en JSX — usa obj.prop; (4) export default en cada componente de entrada. ";

/** Cuando el proyecto ya tiene código: no borrar features al ampliar (p. ej. buscador de vuelos). */
export function buildPreserveExistingPrefix(fileCount: number): string {
  if (fileCount < 2) return "";
  return (
    "[PRESERVAR AVANCE / PRESERVACIÓN DE ESTRUCTURA] El proyecto YA tiene archivos generados. " +
    "NUNCA elimines componentes, secciones, formularios ni archivos existentes salvo petición explícita (quitar/eliminar/borrar). " +
    "Reescritura incremental obligatoria: parchea o extiende; si reescribes un archivo, conserva TODA la funcionalidad y exports previos más lo nuevo. "
  );
}

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

    const nativeButtons = countMatches(code, /<button\b(?=[\s/>])/g);
    const nativeWithClick = countMatches(code, /<button\b[^>]*\bonClick\s*=/gi);
    if (nativeButtons >= 2 && nativeWithClick < nativeButtons - 1) {
      issues.push({
        severity: "warn",
        file: f.name,
        message: `Hay ${nativeButtons} <button> nativos pero solo ${nativeWithClick} con onClick; revisa handlers.`,
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

    if (
      /href\s*=\s*["']\s*["']/i.test(code) ||
      (/href\s*=\s*["']#["']/i.test(code) &&
        !/href\s*=\s*["']#(?:inicio|contacto|top)\b/i.test(code) &&
        !/\bonClick\s*=\s*\{[^}]*preventDefault/i.test(code))
    ) {
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

    const isSearchOnly =
      /buscar\s+vuelo|buscar\s+destino|search\s+flight|type=["']search|placeholder=["'][^"']*destino/i.test(
        raw,
      ) && !/guardar|registrarse|signup|crear\s+cuenta|checkout|pedido/i.test(raw);
    const needsPersistence =
      !isSearchOnly &&
      (/guardar|persist|carrito|checkout|pedido|registrarse|crear\s+cuenta/i.test(raw) ||
        (/RegisterForm|registro/i.test(f.name) &&
          /guardar|submit|registrarse|crear\s+cuenta/i.test(raw)));
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

/** Errores graves que impiden considerar la entrega válida. */
export function hasFunctionalBlockingIssues(issues: FunctionalAuditIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

/** Dispara el único reintento automático (errores o avisos). */
export function shouldAutoRetryFunctional(issues: FunctionalAuditIssue[]): boolean {
  return issues.length > 0;
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
