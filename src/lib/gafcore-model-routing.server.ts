/**
 * Resolución de rutas IA con secretos — solo servidor.
 * Tipos y normalización de slugs: gafcore-model-routing.shared.ts
 */
import { GAFCORE_ANTHROPIC_API_VERSION, GAFCORE_ANTHROPIC_MODEL_DEFAULT } from "@/lib/gafcore-assistant-prompt.shared";
import {
  detectModelFamily,
  normalizeModelSlug,
  type ResolvedProvider,
  type ResolvedRoute,
} from "@/lib/gafcore-model-routing.shared";
import { GPTPRO4ALL_API_DEFAULT_MODEL } from "@/lib/gafcore-chat.shared";
import { listActiveGafcoreAiProviderRoutes } from "@/lib/gafcore-ai-provider-configs.server";

export type { ResolvedProvider, ResolvedRoute };

function normalizeChatCompletionsUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return trimmed;

  try {
    const url = new URL(trimmed);
    const path = url.pathname.replace(/\/+$/g, "");
    if (!path || path === "/") {
      url.pathname = "/v1/chat/completions";
      return url.toString();
    }
    if (path === "/v1") {
      url.pathname = "/v1/chat/completions";
      return url.toString();
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}

function normalizeResponsesUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return trimmed;

  try {
    const url = new URL(trimmed);
    const path = url.pathname.replace(/\/+$/g, "");
    if (!path || path === "/" || path === "/v1" || path === "/v1/chat/completions") {
      url.pathname = "/v1/responses";
      return url.toString();
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}

function isGptpro4AllUrl(rawUrl: string | undefined): boolean {
  return Boolean(rawUrl?.toLowerCase().includes("api.chatgptpro4all.com"));
}

function isGptpro4AllModel(model: string | undefined): boolean {
  const m = model?.trim().toLowerCase();
  return Boolean(
    m &&
      (m === GPTPRO4ALL_API_DEFAULT_MODEL.toLowerCase() ||
        m.startsWith("gptpro4all/") ||
        /^gpt-5(?:\.|-)5\b/.test(m)),
  );
}

function providerDefaultModel(provider: ResolvedProvider): string {
  if (provider === "anthropic") return GAFCORE_ANTHROPIC_MODEL_DEFAULT;
  if (provider === "openai") return "gpt-4o-mini";
  if (provider === "openrouter") return "openai/gpt-4o-mini";
  if (provider === "gptpro4all") return GPTPRO4ALL_API_DEFAULT_MODEL;
  return "";
}

function modelForFallbackProvider(
  provider: ResolvedProvider,
  modelHint: string | undefined,
  configuredDefault?: string,
): string {
  const requested = modelHint?.trim();
  const fallback = configuredDefault?.trim() || providerDefaultModel(provider);
  if (!requested) return fallback;

  const family = detectModelFamily(requested);

  if (provider === "gptpro4all") {
    return family === "claude" ? fallback : normalizeModelSlug(requested, "gptpro4all");
  }

  if (provider === "anthropic") {
    return family === "claude" ? normalizeModelSlug(requested, "anthropic") : fallback;
  }

  if (provider === "openai") {
    if (family === "openai" && !isGptpro4AllModel(requested)) {
      return normalizeModelSlug(requested, "openai");
    }
    return fallback || "gpt-4o-mini";
  }

  if (provider === "openrouter") {
    if (isGptpro4AllModel(requested)) return fallback || "openai/gpt-4o-mini";
    if (family === "openai" || family === "claude" || family === "gemini") {
      return normalizeModelSlug(requested, "openrouter");
    }
    return fallback || "openai/gpt-4o-mini";
  }

  return fallback || requested;
}

function resolveGptpro4AllRoute(
  modelHint: string | undefined,
  family: ReturnType<typeof detectModelFamily>,
): ResolvedRoute | null {
  const explicitBase = process.env.GPTPRO4ALL_BASE_URL?.trim();
  const customUrl = process.env.AI_CHAT_COMPLETIONS_URL?.trim();
  const baseUrl =
    explicitBase ||
    (isGptpro4AllUrl(customUrl) ? customUrl : "") ||
    (process.env.GPTPRO4ALL_API_KEY?.trim() ? "https://api.chatgptpro4all.com/v1" : "");
  const apiKey =
    process.env.GPTPRO4ALL_API_KEY?.trim() ||
    (baseUrl ? process.env.AI_API_KEY?.trim() : "");

  if (!baseUrl || !apiKey) return null;

  const requested = modelHint?.trim();
  const modelSlug =
    requested && family !== "claude"
      ? modelForFallbackProvider("gptpro4all", requested, process.env.AI_MODEL_DEEP)
      : (process.env.AI_MODEL_DEEP?.trim() || GPTPRO4ALL_API_DEFAULT_MODEL);

  return {
    provider: "gptpro4all",
    url: normalizeResponsesUrl(baseUrl),
    apiKey,
    extraHeaders: {},
    modelSlug,
    wireApi: "responses",
  };
}

function makeAnthropicRoute(modelSlug: string, apiKey: string): ResolvedRoute {
  return {
    provider: "anthropic",
    url: "https://api.anthropic.com/v1/messages",
    apiKey,
    extraHeaders: { "anthropic-version": GAFCORE_ANTHROPIC_API_VERSION },
    modelSlug,
    wireApi: "chat_completions",
  };
}

export function resolveAllAiRoutes(modelHint?: string): ResolvedRoute[] {
  const routes: ResolvedRoute[] = [];
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  const openrouterKey = process.env.OPENROUTER_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const family = modelHint ? detectModelFamily(modelHint) : "other";

  const gptpro4allRoute = resolveGptpro4AllRoute(modelHint, family);
  if (gptpro4allRoute && family !== "claude") {
    routes.push(gptpro4allRoute);
  }

  const customUrl = process.env.AI_CHAT_COMPLETIONS_URL?.trim();
  const customKey = process.env.AI_API_KEY?.trim();
  if (customUrl && customKey && !isGptpro4AllUrl(customUrl)) {
    routes.push({
      provider: "custom",
      url: normalizeChatCompletionsUrl(customUrl),
      apiKey: customKey,
      extraHeaders: {},
      modelSlug: modelForFallbackProvider("custom", modelHint, process.env.AI_MODEL_DEEP),
      wireApi: "chat_completions",
    });
  }

  if (anthropicKey && (family === "claude" || (!modelHint && !gptpro4allRoute))) {
    const slug = family === "claude"
      ? normalizeModelSlug(modelHint?.trim() || GAFCORE_ANTHROPIC_MODEL_DEFAULT, "anthropic")
      : GAFCORE_ANTHROPIC_MODEL_DEFAULT;
    routes.push(makeAnthropicRoute(slug, anthropicKey));
  }

  if (gptpro4allRoute && family === "claude") {
    routes.push(gptpro4allRoute);
  }

  if (anthropicKey && gptpro4allRoute && family !== "claude") {
    routes.push(makeAnthropicRoute(GAFCORE_ANTHROPIC_MODEL_DEFAULT, anthropicKey));
  }

  if (openrouterKey) {
    const openrouterUrl = process.env.OPENROUTER_CHAT_COMPLETIONS_URL?.trim() || "https://openrouter.ai/api/v1/chat/completions";
    routes.push({
      provider: "openrouter",
      url: openrouterUrl,
      apiKey: openrouterKey,
      extraHeaders: {
        "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER?.trim() || "https://gafcore.com",
        "X-Title": process.env.OPENROUTER_APP_TITLE?.trim() || "GafCore",
      },
      modelSlug: modelForFallbackProvider("openrouter", modelHint),
      wireApi: "chat_completions",
    });
  }

  if (openaiKey) {
    const openaiUrl = process.env.OPENAI_CHAT_COMPLETIONS_URL?.trim() || "https://api.openai.com/v1/chat/completions";
    const openaiSlug = modelForFallbackProvider("openai", modelHint);
    routes.push({
      provider: "openai",
      url: openaiUrl,
      apiKey: openaiKey,
      extraHeaders: {},
      modelSlug: openaiSlug,
      wireApi: "chat_completions",
    });
  }

  if (anthropicKey && routes.length === 0) {
    routes.push(makeAnthropicRoute(GAFCORE_ANTHROPIC_MODEL_DEFAULT, anthropicKey));
  }

  return routes;
}

export function resolveAiRoute(modelHint?: string): ResolvedRoute {
  const all = resolveAllAiRoutes(modelHint);
  if (all.length === 0) {
    throw new Error(
      "AI no configurado: define GPTPRO4ALL_API_KEY, ANTHROPIC_API_KEY, OPENROUTER_API_KEY, OPENAI_API_KEY, o AI_CHAT_COMPLETIONS_URL+AI_API_KEY.",
    );
  }
  return all[0];
}

export async function resolveAllAiRoutesForRequest(modelHint?: string): Promise<ResolvedRoute[]> {
  const configuredRoutes = await listActiveGafcoreAiProviderRoutes(modelHint);
  const envRoutes = resolveAllAiRoutes(modelHint);
  if (configuredRoutes.length === 0) return envRoutes;
  return [...configuredRoutes, ...envRoutes];
}
