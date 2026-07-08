/**
 * Compatibilidad para llamadas antiguas del chat general.
 * La ejecución real pasa por el gateway permitido de GafCore.
 */
import { postChatCompletions } from "@/lib/ai-chat-completions.server";
import { GAFCORE_ASSISTANT_SYSTEM_PROMPT } from "@/lib/gafcore-assistant-prompt.shared";

const DEFAULT_COMPAT_MODEL = "anthropic/claude-sonnet-4.5";

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
 * Envía mensajes al gateway de IA y devuelve el texto de la respuesta.
 */
export async function completeClaudeChat(
  messages: ClaudeChatMessage[],
  options: ClaudeChatOptions = {},
): Promise<{ text: string; model: string }> {
  const systemPrompt = options.systemPrompt ?? GAFCORE_ASSISTANT_SYSTEM_PROMPT;
  const model = options.model ?? DEFAULT_COMPAT_MODEL;

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
    throw new Error(detail || `GafCore AI error (${res.status})`);
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    model?: string;
  };
  const text = json.choices?.[0]?.message?.content?.trim() ?? "";
  return { text, model: json.model ?? model };
}

/**
 * Stream SSE compatible con el chat general.
 */
export async function streamClaudeChat(
  messages: ClaudeChatMessage[],
  options: ClaudeChatOptions = {},
): Promise<Response> {
  const systemPrompt = options.systemPrompt ?? GAFCORE_ASSISTANT_SYSTEM_PROMPT;
  const model = options.model ?? DEFAULT_COMPAT_MODEL;
  const conversation = messages.filter((m) => m.role !== "system");

  return postChatCompletions({
    model,
    messages: [{ role: "system", content: systemPrompt }, ...conversation],
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.7,
    stream: true,
  });
}
