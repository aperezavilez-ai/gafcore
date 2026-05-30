import type { AiProviderStatus } from "@/services/ai/types.shared";

export const OPENAI_PROVIDER_ID = "openai" as const;

function hasEnv(key: string): boolean {
  const v = process.env[key];
  return typeof v === "string" && v.trim().length > 0;
}

/** OpenAI directo o vía OpenRouter (recomendado). */
export function getOpenAiProviderStatus(): AiProviderStatus {
  const viaOpenRouter = hasEnv("OPENROUTER_API_KEY");
  const direct = hasEnv("OPENAI_API_KEY");
  const custom = hasEnv("AI_CHAT_COMPLETIONS_URL") && hasEnv("AI_API_KEY");
  return {
    id: OPENAI_PROVIDER_ID,
    configured: viaOpenRouter || direct || custom,
    envKeys: viaOpenRouter
      ? ["OPENROUTER_API_KEY"]
      : direct
        ? ["OPENAI_API_KEY"]
        : custom
          ? ["AI_CHAT_COMPLETIONS_URL", "AI_API_KEY"]
          : ["OPENROUTER_API_KEY", "OPENAI_API_KEY"],
  };
}

export function defaultOpenAiCodeModel(): string {
  return process.env.AI_MODEL_DEEP?.trim() || "openai/gpt-4o";
}
