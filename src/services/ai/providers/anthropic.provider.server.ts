import type { AiProviderStatus } from "@/services/ai/types.shared";

export const ANTHROPIC_PROVIDER_ID = "anthropic" as const;

function hasEnv(key: string): boolean {
  const v = process.env[key];
  return typeof v === "string" && v.trim().length > 0;
}

/** Claude vía OpenRouter (preferido) o `ANTHROPIC_API_KEY` directo. */
export function getAnthropicProviderStatus(): AiProviderStatus {
  const openRouter = hasEnv("OPENROUTER_API_KEY");
  const direct = hasEnv("ANTHROPIC_API_KEY");
  return {
    id: ANTHROPIC_PROVIDER_ID,
    configured: openRouter || direct,
    envKeys: openRouter ? ["OPENROUTER_API_KEY"] : ["ANTHROPIC_API_KEY", "OPENROUTER_API_KEY"],
  };
}

export function defaultAnthropicDeepModel(): string {
  return process.env.AI_MODEL_DEEP?.trim() || "anthropic/claude-sonnet-4.5";
}
