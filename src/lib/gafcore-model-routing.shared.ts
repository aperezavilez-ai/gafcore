/**
 * Router de proveedores IA: decide URL/headers/slug según el modelo solicitado.
 *
 * Lógica (orden de preferencia):
 * 1. AI_CHAT_COMPLETIONS_URL + AI_API_KEY → endpoint custom (máxima prioridad).
 * 2. OPENROUTER_API_KEY → OpenRouter (OpenAI-compat 100%, cubre Claude/GPT/Gemini en SSE estándar).
 * 3. ANTHROPIC_API_KEY (solo si no hay OpenRouter) → Anthropic directo + wrapper.
 * 4. OPENAI_API_KEY → OpenAI directo.
 *
 * NOTA: OpenRouter se prioriza sobre Anthropic directo porque su SSE es OpenAI-compat
 * (`choices[0].delta.content`) y el cliente del IDE consume ese formato. El SSE nativo
 * de Anthropic usa `content_block_delta` y rompía el stream.
 */

export type ResolvedProvider = "anthropic" | "openai" | "openrouter" | "custom";

export type ResolvedRoute = {
  provider: ResolvedProvider;
  url: string;
  apiKey: string;
  extraHeaders: Record<string, string>;
  /** Slug normalizado al formato que espera el proveedor seleccionado. */
  modelSlug: string;
};

/**
 * Normaliza slugs entre formatos OpenRouter (`anthropic/claude-sonnet-4.5`) y
 * proveedor nativo (`claude-sonnet-4-5`).
 */
export function normalizeModelSlug(model: string, target: ResolvedProvider): string {
  const m = model.trim();
  if (!m) return m;

  if (target === "anthropic") {
    // Remueve prefijo "anthropic/" y reemplaza "." por "-" en versiones (4.5 → 4-5)
    const stripped = m.replace(/^anthropic\//i, "");
    return stripped.replace(/(\d+)\.(\d+)/g, "$1-$2");
  }

  if (target === "openai") {
    // OpenAI directo usa slug sin prefijo "openai/"
    return m.replace(/^openai\//i, "");
  }

  // OpenRouter: si no hay prefijo y es modelo conocido, lo añadimos
  if (target === "openrouter") {
    if (m.includes("/")) return m;
    if (/^claude-/i.test(m)) {
      // claude-sonnet-4-5 → anthropic/claude-sonnet-4.5
      const restored = m.replace(/(\d+)-(\d+)(?!-)/g, "$1.$2");
      return `anthropic/${restored}`;
    }
    if (/^gpt-|^o\d-/i.test(m)) return `openai/${m}`;
    if (/^gemini/i.test(m)) return `google/${m}`;
    return m;
  }

  return m;
}

/** Detecta familia del modelo por el slug. */
export function detectModelFamily(model: string): "claude" | "openai" | "gemini" | "other" {
  const m = model.toLowerCase();
  if (m.includes("claude") || m.startsWith("anthropic/")) return "claude";
  if (m.startsWith("openai/") || /^gpt-|^o\d-/.test(m) || m.includes("/gpt-")) return "openai";
  if (m.includes("gemini") || m.startsWith("google/")) return "gemini";
  return "other";
}

/**
 * Devuelve TODAS las rutas disponibles ordenadas por preferencia.
 * El caller puede iterarlas como cadena de fallback cuando la primera falla con
 * 401/402/403 (sin saldo / clave inválida en ese proveedor).
 */
export function resolveAllAiRoutes(modelHint?: string): ResolvedRoute[] {
  const routes: ResolvedRoute[] = [];

  const customUrl = process.env.AI_CHAT_COMPLETIONS_URL?.trim();
  const customKey = process.env.AI_API_KEY?.trim();
  if (customUrl && customKey) {
    routes.push({
      provider: "custom",
      url: customUrl,
      apiKey: customKey,
      extraHeaders: {},
      modelSlug: modelHint?.trim() ?? "",
    });
  }

  const family = modelHint ? detectModelFamily(modelHint) : "other";
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  const openrouterKey = process.env.OPENROUTER_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();

  // OpenRouter primero: SSE OpenAI-compat funciona out-of-the-box con el cliente.
  if (openrouterKey) {
    routes.push({
      provider: "openrouter",
      url: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: openrouterKey,
      extraHeaders: {
        "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER?.trim() || "https://gafcore.com",
        "X-Title": process.env.OPENROUTER_APP_TITLE?.trim() || "GafCore",
      },
      modelSlug: modelHint ? normalizeModelSlug(modelHint, "openrouter") : "",
    });
  }

  // OpenAI directo: como fallback (o como primario si no hay OpenRouter).
  // Cuando viene como fallback de Claude, el modelo se traduce a gpt-4o (deep) o gpt-4o-mini (fast).
  if (openaiKey) {
    let openaiSlug: string;
    if (family === "claude") {
      // Mapeo: claude-sonnet → gpt-4o (deep); claude-haiku → gpt-4o-mini (fast).
      openaiSlug = /haiku|fast/i.test(modelHint ?? "") ? "gpt-4o-mini" : "gpt-4o";
    } else if (family === "gemini") {
      openaiSlug = "gpt-4o";
    } else {
      openaiSlug = normalizeModelSlug(modelHint ?? "gpt-4o-mini", "openai");
    }
    routes.push({
      provider: "openai",
      url: "https://api.openai.com/v1/chat/completions",
      apiKey: openaiKey,
      extraHeaders: {},
      modelSlug: openaiSlug,
    });
  }

  // Anthropic directo: último (requiere wrapper SSE no implementado para stream).
  if (family === "claude" && anthropicKey) {
    routes.push({
      provider: "anthropic",
      url: "https://api.anthropic.com/v1/chat/completions",
      apiKey: anthropicKey,
      extraHeaders: { "anthropic-version": "2023-06-01" },
      modelSlug: normalizeModelSlug(modelHint ?? "claude-sonnet-4-5", "anthropic"),
    });
  }

  return routes;
}

export function resolveAiRoute(modelHint?: string): ResolvedRoute {
  const all = resolveAllAiRoutes(modelHint);
  if (all.length === 0) {
    throw new Error(
      "AI no configurado: define ANTHROPIC_API_KEY, OPENROUTER_API_KEY, OPENAI_API_KEY, o AI_CHAT_COMPLETIONS_URL+AI_API_KEY.",
    );
  }
  return all[0];
}
