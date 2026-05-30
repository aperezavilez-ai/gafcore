import type { AiProviderStatus } from "@/services/ai/types.shared";

export const GEMINI_PROVIDER_ID = "gemini" as const;

function hasEnv(key: string): boolean {
  const v = process.env[key];
  return typeof v === "string" && v.trim().length > 0;
}

/** Gemini vía OpenRouter o Google AI Studio (`GOOGLE_AI_API_KEY` / `GEMINI_API_KEY`). */
export function getGeminiProviderStatus(): AiProviderStatus {
  const openRouter = hasEnv("OPENROUTER_API_KEY");
  const google = hasEnv("GOOGLE_AI_API_KEY") || hasEnv("GEMINI_API_KEY");
  return {
    id: GEMINI_PROVIDER_ID,
    configured: openRouter || google,
    envKeys: openRouter
      ? ["OPENROUTER_API_KEY"]
      : google
        ? ["GOOGLE_AI_API_KEY", "GEMINI_API_KEY"]
        : ["OPENROUTER_API_KEY", "GOOGLE_AI_API_KEY"],
  };
}

export function defaultGeminiFastModel(): string {
  return process.env.AI_MODEL_FAST?.trim() || "google/gemini-2.0-flash-001";
}

export function defaultGeminiUiModel(): string {
  return process.env.AI_MODEL_UI?.trim() || "google/gemini-2.5-pro";
}
