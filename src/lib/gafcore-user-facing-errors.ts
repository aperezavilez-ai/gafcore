/**
 * Sanitiza cualquier texto que se mostraría al usuario para que NUNCA aparezca:
 * - Nombres de proveedores externos: OpenAI, OpenRouter, Anthropic, Claude, GPT, Gemini, Google.
 * - Nombres de variables de entorno (XXX_API_KEY).
 * - Claves API (sk-..., Bearer ...).
 *
 * El usuario solo conoce GafCore como marca.
 */
const PROVIDER_NAME_RE =
  /\b(openrouter|open[\s-]?ai|anthropic|claude(\s+sonnet|\s+opus|\s+haiku)?(\s+\d[\d.\-]*)?|gpt-?\d[\w.-]*|o\d-[\w.-]*|gemini[\w.-]*|google\s+ai|chatgpt|mistral|llama|deepseek)\b/gi;
const ENV_VAR_RE = /\b[A-Z][A-Z0-9_]{2,}_(API_KEY|TOKEN|SECRET|URL)\b/g;
const API_KEY_LEAK_RE = /\b(sk-[a-zA-Z0-9]{8,}|Bearer\s+[A-Za-z0-9._\-]{12,})/g;

function looksLikeInternalConfigOrGatewayError(text: string): boolean {
  if (ENV_VAR_RE.test(text) && /not configured|missing|invalid|unauthorized|forbidden/i.test(text)) {
    ENV_VAR_RE.lastIndex = 0;
    return true;
  }
  ENV_VAR_RE.lastIndex = 0;
  if (API_KEY_LEAK_RE.test(text)) {
    API_KEY_LEAK_RE.lastIndex = 0;
    return true;
  }
  API_KEY_LEAK_RE.lastIndex = 0;
  return false;
}

/** Reemplaza menciones a proveedores por "el asistente IA" / "GafCore". */
function maskProviderNames(text: string): string {
  return text
    .replace(API_KEY_LEAK_RE, "[clave oculta]")
    .replace(ENV_VAR_RE, "configuración del servidor")
    .replace(PROVIDER_NAME_RE, "el asistente IA");
}

/**
 * Evita promesas engañosas tipo checklist fijo "1) 2) 3)".
 * Mantiene el mensaje útil, pero sin secuencia obligatoria ni "paso recomendado".
 */
function stripMisleadingStepChecklist(text: string): string {
  let out = text;
  out = out.replace(/siguiente\s+paso\s+recomendado\s*:?\s*/gi, "");
  out = out.replace(/^\s*\d+[.)]\s+.*$/gm, "");
  out = out.replace(/\n{3,}/g, "\n\n");
  if (/build aplicado/i.test(out) && /publicar/i.test(out)) {
    return "Build aplicado. Revisa la vista previa y publica cuando realmente esté listo. Si falla, lo corregimos y reintentamos.";
  }
  return out.trim();
}

export function sanitizeUserFacingAiText(text: string): string {
  const raw = String(text ?? "");
  if (!raw.trim()) return raw;
  if (looksLikeInternalConfigOrGatewayError(raw)) {
    return "El asistente IA de GafCore no está disponible un momento. Inténtalo de nuevo en unos minutos.";
  }
  const t = raw.trim();
  const lower = t.toLowerCase();
  if (lower === "ai_not_configured" || lower.includes("ai no configurado")) {
    return "El asistente IA de GafCore no está disponible un momento. Inténtalo de nuevo en unos minutos.";
  }
  if (lower === "upstream" || lower === "credits_error" || lower === "no_stream_body") {
    return "El asistente IA tuvo un error temporal. Inténtalo de nuevo en unos segundos.";
  }
  if (/^http \d{3}$/i.test(t)) {
    return "El asistente IA respondió con un error. Inténtalo de nuevo en unos minutos.";
  }
  // Caso general: censurar cualquier mención a proveedor que se haya colado.
  return stripMisleadingStepChecklist(maskProviderNames(raw));
}
