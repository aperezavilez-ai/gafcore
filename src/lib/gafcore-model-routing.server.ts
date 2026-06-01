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

export type { ResolvedProvider, ResolvedRoute };

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

  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  const openrouterKey = process.env.OPENROUTER_API_KEY?.trim();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const family = modelHint
    ? detectModelFamily(modelHint)
    : anthropicKey
      ? "claude"
      : "other";

  if (anthropicKey) {
    const slug =
      family === "claude"
        ? normalizeModelSlug(modelHint?.trim() || GAFCORE_ANTHROPIC_MODEL_DEFAULT, "anthropic")
        : GAFCORE_ANTHROPIC_MODEL_DEFAULT;
    routes.push({
      provider: "anthropic",
      url: "https://api.anthropic.com/v1/messages",
      apiKey: anthropicKey,
      extraHeaders: { "anthropic-version": GAFCORE_ANTHROPIC_API_VERSION },
      modelSlug: slug,
    });
  }

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

  if (openaiKey) {
    let openaiSlug: string;
    if (family === "claude") {
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
