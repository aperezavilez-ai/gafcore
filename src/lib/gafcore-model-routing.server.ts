/**
 * Resolucion de rutas IA con secretos — solo servidor.
 * Orden permitido para GafCore:
 * 1) api.meai.cloud
 * 2) api.chatgptpro4all.com
 * 3) openrouter.ai
 * 4) Gemini directo en Google APIs
 */
import { GPTPRO4ALL_API_DEFAULT_MODEL } from "@/lib/gafcore-chat.shared";
import {
  detectModelFamily,
  normalizeModelSlug,
  type ResolvedProvider,
  type ResolvedRoute,
} from "@/lib/gafcore-model-routing.shared";

export type { ResolvedProvider, ResolvedRoute };

const MEAI_DEFAULT_BASE_URL = "https://api.meai.cloud/v1";
const GPTPRO4ALL_DEFAULT_BASE_URL = "https://api.chatgptpro4all.com/v1";
const OPENROUTER_DEFAULT_URL = "https://openrouter.ai/api/v1/chat/completions";
const GEMINI_DEFAULT_MODEL = "gemini-2.0-flash";

function envFirst(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

function normalizeChatCompletionsUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return trimmed;
  try {
    const url = new URL(trimmed);
    const path = url.pathname.replace(/\/+$/g, "");
    if (!path || path === "/" || path === "/v1") {
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

function urlHost(rawUrl: string | undefined): string {
  if (!rawUrl?.trim()) return "";
  try {
    return new URL(rawUrl.trim()).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isHost(rawUrl: string | undefined, host: string): boolean {
  return urlHost(rawUrl) === host;
}

function modelForOpenRouter(modelHint?: string): string {
  const requested = modelHint?.trim();
  if (!requested) return process.env.AI_MODEL_DEEP?.trim() || "google/gemini-2.5-pro";
  return normalizeModelSlug(requested, "openrouter");
}

function modelForGemini(modelHint?: string): string {
  const requested = modelHint?.trim();
  if (!requested) {
    return (
      process.env.GEMINI_MODEL?.trim() ||
      process.env.GOOGLE_AI_MODEL?.trim() ||
      process.env.AI_MODEL_FAST?.trim()?.replace(/^google\//i, "") ||
      GEMINI_DEFAULT_MODEL
    );
  }
  if (detectModelFamily(requested) === "gemini") return normalizeModelSlug(requested, "gemini");
  return (
    process.env.GEMINI_MODEL?.trim() ||
    process.env.GOOGLE_AI_MODEL?.trim() ||
    process.env.AI_MODEL_FAST?.trim()?.replace(/^google\//i, "") ||
    GEMINI_DEFAULT_MODEL
  );
}

function makeMeaiRoute(modelHint?: string): ResolvedRoute | null {
  const customUrl = process.env.AI_CHAT_COMPLETIONS_URL?.trim();
  const explicitUrl = envFirst("MEAI_CHAT_COMPLETIONS_URL", "GAFCORE_MEAI_CHAT_COMPLETIONS_URL");
  const explicitBase = envFirst("MEAI_BASE_URL", "GAFCORE_MEAI_BASE_URL");
  const baseUrl =
    explicitUrl ||
    explicitBase ||
    (isHost(customUrl, "api.meai.cloud") ? customUrl || "" : "") ||
    (envFirst("MEAI_API_KEY", "GAFCORE_MEAI_API_KEY") ? MEAI_DEFAULT_BASE_URL : "");
  const apiKey =
    envFirst("MEAI_API_KEY", "GAFCORE_MEAI_API_KEY") ||
    (isHost(customUrl, "api.meai.cloud") ? process.env.AI_API_KEY?.trim() || "" : "");
  if (!baseUrl || !apiKey) return null;
  return {
    provider: "custom",
    url: normalizeChatCompletionsUrl(baseUrl),
    apiKey,
    extraHeaders: {},
    modelSlug: modelHint?.trim() || process.env.AI_MODEL_DEEP?.trim() || "gpt-5.5",
    wireApi: "chat_completions",
  };
}

function makeGptpro4AllRoute(modelHint?: string): ResolvedRoute | null {
  const customUrl = process.env.AI_CHAT_COMPLETIONS_URL?.trim();
  const explicitBase = process.env.GPTPRO4ALL_BASE_URL?.trim();
  const baseUrl =
    explicitBase ||
    (isHost(customUrl, "api.chatgptpro4all.com") ? customUrl || "" : "") ||
    (process.env.GPTPRO4ALL_API_KEY?.trim() ? GPTPRO4ALL_DEFAULT_BASE_URL : "");
  const apiKey =
    process.env.GPTPRO4ALL_API_KEY?.trim() ||
    (isHost(customUrl, "api.chatgptpro4all.com") ? process.env.AI_API_KEY?.trim() || "" : "");
  if (!baseUrl || !apiKey) return null;
  return {
    provider: "gptpro4all",
    url: normalizeResponsesUrl(baseUrl),
    apiKey,
    extraHeaders: {},
    modelSlug: modelHint?.trim() || process.env.AI_MODEL_DEEP?.trim() || GPTPRO4ALL_API_DEFAULT_MODEL,
    wireApi: "responses",
  };
}

function makeOpenRouterRoute(modelHint?: string): ResolvedRoute | null {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return null;
  const url = process.env.OPENROUTER_CHAT_COMPLETIONS_URL?.trim() || OPENROUTER_DEFAULT_URL;
  if (!isHost(url, "openrouter.ai")) return null;
  return {
    provider: "openrouter",
    url,
    apiKey,
    extraHeaders: {
      "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER?.trim() || "https://gafcore.com",
      "X-Title": process.env.OPENROUTER_APP_TITLE?.trim() || "GafCore",
    },
    modelSlug: modelForOpenRouter(modelHint),
    wireApi: "chat_completions",
  };
}

function makeGeminiRoute(modelHint?: string): ResolvedRoute | null {
  const apiKey = envFirst("GEMINI_API_KEY", "GOOGLE_AI_API_KEY", "GOOGLE_API_KEY");
  if (!apiKey) return null;
  const modelSlug = modelForGemini(modelHint);
  const base = envFirst("GEMINI_API_BASE_URL", "GOOGLE_AI_BASE_URL") || "https://generativelanguage.googleapis.com/v1beta";
  return {
    provider: "gemini",
    url: base.replace(/\/+$/g, ""),
    apiKey,
    extraHeaders: {},
    modelSlug,
    wireApi: "gemini_generate_content",
  };
}

export function resolveAllAiRoutes(modelHint?: string): ResolvedRoute[] {
  return [
    makeMeaiRoute(modelHint),
    makeGptpro4AllRoute(modelHint),
    makeOpenRouterRoute(modelHint),
    makeGeminiRoute(modelHint),
  ].filter((route): route is ResolvedRoute => Boolean(route));
}

export function resolveAiRoute(modelHint?: string): ResolvedRoute {
  const all = resolveAllAiRoutes(modelHint);
  if (all.length === 0) {
    throw new Error(
      "AI no configurado: define MEAI_API_KEY, GPTPRO4ALL_API_KEY, OPENROUTER_API_KEY o GEMINI_API_KEY/GOOGLE_AI_API_KEY. Solo se permiten api.meai.cloud, api.chatgptpro4all.com, openrouter.ai y Google Gemini.",
    );
  }
  return all[0];
}

export async function resolveAllAiRoutesForRequest(modelHint?: string): Promise<ResolvedRoute[]> {
  return resolveAllAiRoutes(modelHint);
}
