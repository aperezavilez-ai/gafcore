/**
 * Evita mostrar al usuario nombres de variables de entorno o códigos internos
 * devueltos por gateways de IA.
 */
function looksLikeInternalConfigOrGatewayError(text: string): boolean {
  if (/\b[A-Z][A-Z0-9_]{2,}_API_KEY\b/i.test(text) && /not configured|missing|invalid|unauthorized|forbidden/i.test(text)) {
    return true;
  }
  if (/\b(sk-[a-zA-Z0-9]{10,}|Bearer\s+sk-)/i.test(text)) return true;
  return false;
}

export function sanitizeUserFacingAiText(text: string): string {
  const raw = String(text ?? "");
  if (!raw.trim()) return raw;
  if (looksLikeInternalConfigOrGatewayError(raw)) {
    return "El generador de IA no está disponible en este momento. Si persiste, avísanos desde soporte en tu proyecto.";
  }
  const t = raw.trim();
  const lower = t.toLowerCase();
  if (lower === "ai_not_configured" || lower.includes("ai no configurado")) {
    return "El generador de IA no está configurado en el servidor. Inténtalo más tarde.";
  }
  if (lower === "upstream" || lower === "credits_error" || lower === "no_stream_body") {
    return "No se pudo completar la solicitud al servicio de IA. Si tienes saldo en GafCore y sigue fallando, suele ser clave o cuota del proveedor (OpenRouter/OpenAI) en el servidor.";
  }
  if (/^http \d{3}$/i.test(t)) {
    return "El servicio de IA respondió con un error. Inténtalo de nuevo en unos minutos.";
  }
  return raw;
}
