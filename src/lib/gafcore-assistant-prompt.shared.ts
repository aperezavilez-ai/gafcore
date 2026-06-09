/** Regla de sintaxis — inyectada al inicio de todos los system prompts de generación. */
export const GAFCORE_SYNTAX_ABSOLUTE_RULE =
  "REGLA ABSOLUTA DE SINTAXIS: Antes de cerrar cualquier archivo, verifica que todas las llaves {}, paréntesis () y tags JSX <> estén correctamente balanceados. Cuenta las aperturas y cierres. Nunca entregues código con sintaxis rota. Si un archivo tiene más de 200 líneas, divide en componentes más pequeños.";

/** System prompt del chat flotante y asistente general de GafCore. */
export const GAFCORE_ASSISTANT_SYSTEM_PROMPT = `${GAFCORE_SYNTAX_ABSOLUTE_RULE}

Eres el asistente de GafCore, una plataforma de desarrollo con IA. Ayudas a crear apps, resolver errores de código y guiar al usuario. Responde siempre en español, sé conciso y técnico.`;

/** Modelo Claude directo (Anthropic API). Sobrescribible con AI_MODEL_FAST / AI_MODEL_DEEP. */
export const GAFCORE_ANTHROPIC_MODEL_DEFAULT = "claude-sonnet-4-6";

/** Modelos Anthropic retirados o deprecados — se sustituyen por el default actual. */
export const GAFCORE_ANTHROPIC_MODEL_RETIRED = new Set([
  "claude-sonnet-4-20250514",
  "claude-opus-4-20250514",
]);

export const GAFCORE_ANTHROPIC_API_VERSION = "2023-06-01";
