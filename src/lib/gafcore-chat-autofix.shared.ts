/** Instrucciones y heurísticas para auto-corrección del preview (ChatPanel). */

export const GAFCORE_AUTOFIX_SESSION_MAX = 10;

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
    /\bis not defined\b/i.test(message)
  );
}

export function shouldAttemptAiAutofix(message: string): boolean {
  if (!message.trim()) return false;
  if (isNonAutofixablePreviewError(message)) return false;
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
    "- React error #31: NUNCA renderices objetos en JSX. Usa campos (.title, .label) o JSX en .map.",
    "- Sintaxis JSX válida: cierra paréntesis/llaves; no dejes `)}` sueltos.",
    "- Navegación interna: usa #inicio/#contacto o estado React. PROHIBIDO href a gafcore.com o /gafcore/app.",
    "- Prohibido iframe o capturas del IDE GafCore dentro del proyecto.",
    "- Iconos lucide-react: import OBLIGATORIO `import { Sparkles, Star } from \"lucide-react\"` por cada icono usado en JSX.",
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
