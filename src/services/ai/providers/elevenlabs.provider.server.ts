import type { AiProviderStatus } from "@/services/ai/types.shared";

export const ELEVENLABS_PROVIDER_ID = "elevenlabs" as const;

function hasEnv(key: string): boolean {
  const v = process.env[key];
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Voz (TTS) — no usa chat completions.
 * Rutas existentes: `/api/elevenlabs/*` y conectores del IDE.
 */
export function getElevenLabsProviderStatus(): AiProviderStatus {
  return {
    id: ELEVENLABS_PROVIDER_ID,
    configured: hasEnv("ELEVENLABS_API_KEY"),
    envKeys: ["ELEVENLABS_API_KEY"],
  };
}
