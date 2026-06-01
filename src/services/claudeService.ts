/**
 * Chat con Claude (Anthropic) — capa de servicio para UI y rutas API.
 * La implementación HTTP vive en `ai-chat-completions.server.ts` (API nativa + headers).
 */
import { postChatCompletions } from "@/lib/ai-chat-completions.server";
import {
  GAFCORE_ANTHROPIC_MODEL_DEFAULT,
  GAFCORE_ASSISTANT_SYSTEM_PROMPT,
} from "@/lib/gafcore-assistant-prompt.shared";

export type ClaudeChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type ClaudeChatOptions = {
  model?: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
};

/**
 * Envía mensajes a Claude y devuelve el texto de la respuesta (sin stream).
 */
export async function completeClaudeChat(
  messages: ClaudeChatMessage[],
  options: ClaudeChatOptions = {},
): Promise<{ text: string; model: string }> {
  const systemPrompt = options.systemPrompt ?? GAFCORE_ASSISTANT_SYSTEM_PROMPT;
  const model = options.model ?? GAFCORE_ANTHROPIC_MODEL_DEFAULT;

  const conversation = messages.filter((m) => m.role !== "system");
  const res = await postChatCompletions({
    model,
    messages: [{ role: "system", content: systemPrompt }, ...conversation],
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.7,
    stream: false,
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 400);
    throw new Error(detail || `Claude API error (${res.status})`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    model?: string;
  };
  const text = json.choices?.[0]?.message?.content?.trim() ?? "";
  return { text, model: json.model ?? model };
}

/**
 * Stream SSE compatible con OpenAI (para `/api/chat` y el widget flotante).
 */
export async function streamClaudeChat(
  messages: ClaudeChatMessage[],
  options: ClaudeChatOptions = {},
): Promise<Response> {
  const systemPrompt = options.systemPrompt ?? GAFCORE_ASSISTANT_SYSTEM_PROMPT;
  const model = options.model ?? GAFCORE_ANTHROPIC_MODEL_DEFAULT;
  const conversation = messages.filter((m) => m.role !== "system");

  return postChatCompletions({
    model,
    messages: [{ role: "system", content: systemPrompt }, ...conversation],
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.7,
    stream: true,
  });
}
