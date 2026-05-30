/**
 * Contratos del Cerebro Central GafCore (compartido cliente/servidor).
 * La ejecución real sigue en `gafcore-ai-gateway` + `ai-chat-completions` (OpenAI-compatible).
 */

/** Tipo de tarea que enruta el orquestador. */
export type AiBrainTaskKind =
  | "code"
  | "design"
  | "frontend"
  | "chat"
  | "voice"
  | "support"
  | "fix"
  | "deploy";

export type AiBrainProviderId =
  | "openai"
  | "gemini"
  | "anthropic"
  | "openrouter"
  | "custom"
  | "elevenlabs";

export type AiBrainRequest = {
  task: AiBrainTaskKind;
  instruction?: string;
  hasVision?: boolean;
  /** Forzar slug de modelo (avanzado). */
  modelOverride?: string;
};

export type AiBrainRoute = {
  task: AiBrainTaskKind;
  model: string;
  provider: AiBrainProviderId;
  tier: "fast" | "deep" | "ui" | "support";
  /** Si false, el orquestador no debe llamar chat completions (p. ej. voz). */
  usesChatCompletions: boolean;
  note?: string;
};

export type AiProviderStatus = {
  id: AiBrainProviderId;
  configured: boolean;
  envKeys: string[];
};

export type AiBrainCapabilities = {
  aiReady: boolean;
  providers: AiProviderStatus[];
  routesByTask: Record<AiBrainTaskKind, { model: string; provider: AiBrainProviderId }>;
};
