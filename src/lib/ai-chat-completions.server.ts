/**
 * Cliente OpenAI-compatible (`/v1/chat/completions`) con router multi-proveedor.
 * Enruta cada llamada al proveedor más adecuado según el modelo solicitado.
 *
 * Configurable:
 * - `ANTHROPIC_API_KEY` → Claude directo (preferido para modelos claude-*).
 * - `OPENROUTER_API_KEY` → OpenRouter (cubre todos los modelos).
 * - `OPENAI_API_KEY` → OpenAI directo.
 * - `AI_CHAT_COMPLETIONS_URL` + `AI_API_KEY` → endpoint custom (máxima prioridad).
 */
import { resolveAiRoute, type ResolvedRoute } from "@/lib/gafcore-model-routing.shared";

export type AiChatConfig = {
  url: string;
  apiKey: string;
  extraHeaders: Record<string, string>;
};

/**
 * Compatibilidad hacia atrás: devuelve la config "por defecto" sin modelo concreto.
 * Llamadores nuevos deben preferir `postChatCompletions(body)` que enruta por modelo.
 */
export function getAiChatConfig(modelHint?: string): AiChatConfig {
  const route = resolveAiRoute(modelHint);
  return { url: route.url, apiKey: route.apiKey, extraHeaders: route.extraHeaders };
}

export type ChatCompletionsBody = {
  model?: string;
  [key: string]: unknown;
};

/**
 * Convierte un body OpenAI-style a `messages.create` nativo de Anthropic.
 * El endpoint OpenAI-compat de Anthropic aún no cubre todos los casos en estable,
 * así que enviamos en el formato nativo para máxima compatibilidad.
 */
function toAnthropicBody(body: ChatCompletionsBody, modelSlug: string): Record<string, unknown> {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const systemParts: string[] = [];
  const conversation: Array<{ role: "user" | "assistant"; content: unknown }> = [];

  for (const m of messages as Array<{ role: string; content: unknown }>) {
    if (!m || typeof m !== "object") continue;
    if (m.role === "system") {
      if (typeof m.content === "string") systemParts.push(m.content);
      continue;
    }
    if (m.role !== "user" && m.role !== "assistant") continue;
    if (typeof m.content === "string") {
      conversation.push({ role: m.role, content: m.content });
      continue;
    }
    if (Array.isArray(m.content)) {
      const parts = m.content
        .map((p) => {
          if (!p || typeof p !== "object") return null;
          const part = p as { type?: string; text?: string; image_url?: { url?: string } };
          if (part.type === "text" && typeof part.text === "string") {
            return { type: "text", text: part.text };
          }
          if (part.type === "image_url" && part.image_url?.url) {
            return {
              type: "image",
              source: { type: "url", url: part.image_url.url },
            };
          }
          return null;
        })
        .filter(Boolean);
      conversation.push({ role: m.role, content: parts });
      continue;
    }
  }

  const maxTokens = typeof body.max_tokens === "number" ? body.max_tokens : 8192;
  const out: Record<string, unknown> = {
    model: modelSlug,
    messages: conversation,
    max_tokens: maxTokens,
  };
  if (systemParts.length) out.system = systemParts.join("\n\n");
  if (typeof body.temperature === "number") out.temperature = body.temperature;
  if (body.stream) out.stream = body.stream;
  return out;
}

/** Envuelve una respuesta nativa de Anthropic como si fuera OpenAI chat-completions. */
async function wrapAnthropicResponse(res: Response): Promise<Response> {
  if (!res.ok) return res;
  if (res.headers.get("content-type")?.includes("stream")) {
    return res;
  }
  const json = (await res.json().catch(() => null)) as
    | {
        id?: string;
        model?: string;
        content?: Array<{ type?: string; text?: string }>;
        stop_reason?: string;
        usage?: { input_tokens?: number; output_tokens?: number };
      }
    | null;

  if (!json) {
    return new Response(JSON.stringify({ error: "anthropic_invalid_response" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  const text = (json.content ?? [])
    .filter((c) => c?.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("");

  const openaiShape = {
    id: json.id ?? `anthropic-${Date.now()}`,
    object: "chat.completion",
    model: json.model ?? "claude",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: json.stop_reason ?? "stop",
      },
    ],
    usage: {
      prompt_tokens: json.usage?.input_tokens ?? 0,
      completion_tokens: json.usage?.output_tokens ?? 0,
      total_tokens: (json.usage?.input_tokens ?? 0) + (json.usage?.output_tokens ?? 0),
    },
  };

  return new Response(JSON.stringify(openaiShape), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function postChatCompletions(body: ChatCompletionsBody): Promise<Response> {
  const route: ResolvedRoute = resolveAiRoute(body.model);

  // Anthropic directo: usa endpoint nativo + body nativo + autenticación x-api-key.
  if (route.provider === "anthropic") {
    const anthropicBody = toAnthropicBody(body, route.modelSlug);
    const nativeUrl = "https://api.anthropic.com/v1/messages";
    const res = await fetch(nativeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": route.apiKey,
        ...route.extraHeaders,
      },
      body: JSON.stringify(anthropicBody),
    });
    return wrapAnthropicResponse(res);
  }

  // Resto: OpenAI-compatible nativo.
  const outBody: Record<string, unknown> = { ...body };
  if (route.modelSlug) outBody.model = route.modelSlug;

  return fetch(route.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${route.apiKey}`,
      ...route.extraHeaders,
    },
    body: JSON.stringify(outBody),
  });
}
