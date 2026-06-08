/** Instrucciones y heurísticas para auto-corrección del preview (ChatPanel). */

/** Máximo de auto-correcciones IA por sesión (evita bucles que reescriben todo el proyecto). */
export const GAFCORE_AUTOFIX_SESSION_MAX = 2;

/** Auto-fix IA del preview desactivado por defecto; activar con VITE_GAFCORE_PREVIEW_AUTOFIX=1 en build. */
export function isPreviewAutofixAiEnabled(): boolean {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_GAFCORE_PREVIEW_AUTOFIX === "1") {
    return true;
  }
  if (typeof window !== "undefined") {
    try {
      return localStorage.getItem("gafcore_preview_autofix") === "1";
    } catch {
      return false;
    }
  }
  return false;
}

/** Tras restaurar historial (reloj), no disparar auto-fix IA durante este margen. */
export const GAFCORE_AUTOFIX_SUPPRESS_AFTER_RESTORE_MS = 45_000;

export const GAFCORE_CANCEL_PREVIEW_AUTOFIX_EVENT = "gafcore:cancel-preview-autofix";

/** El chat aborta envíos/auto-fix en curso al escuchar esto. */
export const GAFCORE_VERSION_RESTORED_EVENT = "gafcore:version-restored";

let previewAutofixSuppressedUntil = 0;

export function suppressPreviewAutofix(
  ms: number = GAFCORE_AUTOFIX_SUPPRESS_AFTER_RESTORE_MS,
): void {
  previewAutofixSuppressedUntil = Date.now() + ms;
}

export function isPreviewAutofixSuppressed(): boolean {
  return Date.now() < previewAutofixSuppressedUntil;
}

/** Cancela auto-fix en curso y pausa nuevos intentos (p. ej. al restaurar una versión). */
export function dispatchCancelPreviewAutofix(): void {
  suppressPreviewAutofix();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(GAFCORE_CANCEL_PREVIEW_AUTOFIX_EVENT));
  }
}

export function isNonAutofixablePreviewError(message: string): boolean {
  return /No se pudo cargar:|Failed to load|404|net::ERR|jsx shim|__gafcoreInstallJsxGuard|Cannot assign to property ['"]jsx['"]/i.test(
    message,
  );
}

export function isLocalRepairablePreviewError(message: string): boolean {
  return (
    /SyntaxError|Unexpected token/i.test(message) ||
    /Objects are not valid as a React child/i.test(message) ||
    /Minified React error #31/i.test(message) ||
    /error #31/i.test(message) ||
    /Failed to resolve module specifier/i.test(message) ||
    /ReferenceError:\s*\w+\s+is not defined/i.test(message) ||
    /\bis not defined\b/i.test(message) ||
    /Cannot read properties of null \(reading 'useRef'\)/i.test(message) ||
    /reading 'useRef'/i.test(message)
  );
}

export function isSyntaxLikePreviewError(message: string): boolean {
  return /syntax|sintáct|desbalancead|unexpected token|react error #31|error #31|objects are not valid as a react child/i.test(
    message,
  );
}

export function shouldAttemptAiAutofix(message: string): boolean {
  if (!message.trim()) return false;
  if (isNonAutofixablePreviewError(message)) return false;
  if (isSyntaxLikePreviewError(message)) return false;
  return true;
}

export function buildRuntimeAutoFixInstruction(errorMessage: string): string {
  return [
    "[GAFCORE AUTO-FIX INMEDIATO] El preview falló. Corrige el código para que compile y renderice sin errores.",
    "",
    "Error detectado:",
    "```",
    errorMessage.slice(0, 1200),
    "```",
    "",
    "Reglas obligatorias:",
    "- Brain V2: pre-procesa datos antes del return; listas planas de strings; .map((text, idx) => <li key={idx}>{text}</li>). Sin typeof, Array.isArray ni ternarios en return().",
    "- Sintaxis JSX válida: cierra paréntesis/llaves; no dejes `)}` sueltos.",
    "- Navegación interna: usa #inicio/#contacto o estado React. PROHIBIDO href a gafcore.com o /gafcore/app.",
    "- Prohibido iframe o capturas del IDE GafCore dentro del proyecto.",
    "- Iconos lucide-react: import OBLIGATORIO `import { Sparkles, Star } from \"lucide-react\"` por cada icono usado en JSX.",
    "- PROHIBIDO react-router: usa useState para cambiar vistas (cliente/admin/chat).",
    "- Formularios con onSubmit + preventDefault y feedback visible.",
    "- Devuelve archivos COMPLETOS modificados (delta), no fragmentos.",
  ].join("\n");
}

export function buildValidationAutoFixInstruction(
  errorText: string,
  originalHint = "",
): string {
  return [
    buildRuntimeAutoFixInstruction(errorText),
    "",
    originalHint ? `Contexto del pedido: ${originalHint.slice(0, 400)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
