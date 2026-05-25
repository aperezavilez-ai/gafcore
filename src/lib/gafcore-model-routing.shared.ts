/**
 * Router de proveedores IA: decide URL/headers/slug según el modelo solicitado.
 *
 * Lógica:
 * - Si el modelo es Claude y hay ANTHROPIC_API_KEY → Anthropic directo (más barato, prompt caching nativo).
 * - Si el modelo es OpenAI puro y hay OPENAI_API_KEY → OpenAI directo.
 * - Si hay OPENROUTER_API_KEY → OpenRouter (cubre Claude, GPT, Gemini y 200+).
 * - Si hay AI_CHAT_COMPLETIONS_URL + AI_API_KEY → endpoint custom (gana siempre, máxima prioridad).
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

export function resolveAiRoute(modelHint?: string): ResolvedRoute {
  const customUrl = process.env.AI_CHAT_COMPLETIONS_URL?.trim();
  const customKey = process.env.AI_API_KEY?.trim();
  if (customUrl && customKey) {
    return {
      provider: "custom",
      url: customUrl,
      apiKey: customKey,
      extraHeaders: {},
      modelSlug: modelHint?.trim() ?? "",
    };
  }

  const family = modelHint ? detectModelFamily(modelHint) : "other";
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  const openrouterKey = process.env.OPENROUTER_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();

  if (family === "claude" && anthropicKey) {
    return {
      provider: "anthropic",
      url: "https://api.anthropic.com/v1/chat/completions",
      apiKey: anthropicKey,
      extraHeaders: { "anthropic-version": "2023-06-01" },
      modelSlug: normalizeModelSlug(modelHint ?? "claude-sonnet-4-5", "anthropic"),
    };
  }

  if (family === "openai" && openaiKey && !openrouterKey) {
    return {
      provider: "openai",
      url: "https://api.openai.com/v1/chat/completions",
      apiKey: openaiKey,
      extraHeaders: {},
      modelSlug: normalizeModelSlug(modelHint ?? "gpt-4o-mini", "openai"),
    };
  }

  if (openrouterKey) {
    return {
      provider: "openrouter",
      url: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: openrouterKey,
      extraHeaders: {
        "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER?.trim() || "https://gafcore.com",
        "X-Title": process.env.OPENROUTER_APP_TITLE?.trim() || "GafCore",
      },
      modelSlug: modelHint ? normalizeModelSlug(modelHint, "openrouter") : "",
    };
  }

  if (openaiKey) {
    return {
      provider: "openai",
      url: "https://api.openai.com/v1/chat/completions",
      apiKey: openaiKey,
      extraHeaders: {},
      modelSlug: normalizeModelSlug(modelHint ?? "gpt-4o-mini", "openai"),
    };
  }

  throw new Error(
    "AI no configurado: define ANTHROPIC_API_KEY, OPENROUTER_API_KEY, OPENAI_API_KEY, o AI_CHAT_COMPLETIONS_URL+AI_API_KEY.",
  );
}
