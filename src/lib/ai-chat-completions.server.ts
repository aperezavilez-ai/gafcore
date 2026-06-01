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
import { GAFCORE_ANTHROPIC_API_VERSION } from "@/lib/gafcore-assistant-prompt.shared";
import {
  resolveAiRoute,
  resolveAllAiRoutes,
  type ResolvedRoute,
} from "@/lib/gafcore-model-routing.server";
import { logDev } from "@/lib/gafcore-logger.server";

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

/** Convierte SSE de Anthropic Messages API a formato OpenAI (widget `/api/chat`). */
function wrapAnthropicStreamResponse(res: Response): Response {
  if (!res.ok || !res.body) return res;

  const reader = res.body.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let lineEnd: number;
          while ((lineEnd = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, lineEnd).trim();
            buffer = buffer.slice(lineEnd + 1);
            if (!line.startsWith("data:")) continue;
            const payload = line.replace(/^data:\s*/, "").trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const parsed = JSON.parse(payload) as {
                type?: string;
                delta?: { type?: string; text?: string };
              };
              if (
                parsed.type === "content_block_delta" &&
                parsed.delta?.type === "text_delta" &&
                parsed.delta.text
              ) {
                const chunk = { choices: [{ delta: { content: parsed.delta.text } }] };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
              }
            } catch {
              /* línea parcial SSE */
            }
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    status: res.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/** Envuelve una respuesta nativa de Anthropic como si fuera OpenAI chat-completions. */
async function wrapAnthropicResponse(res: Response): Promise<Response> {
  if (!res.ok) return res;
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

/** Códigos en los que descartamos al proveedor y probamos el siguiente. */
function isProviderFatalForFallback(status: number): boolean {
  return status === 401 || status === 402 || status === 403 || status === 404;
}

async function callRoute(
  route: ResolvedRoute,
  body: ChatCompletionsBody,
): Promise<Response> {
  if (route.provider === "anthropic") {
    const anthropicBody = toAnthropicBody(body, route.modelSlug);
    const nativeUrl = "https://api.anthropic.com/v1/messages";
    const res = await fetch(nativeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": route.apiKey,
        "anthropic-version": GAFCORE_ANTHROPIC_API_VERSION,
        ...route.extraHeaders,
      },
      body: JSON.stringify(anthropicBody),
    });
    if (anthropicBody.stream) {
      return wrapAnthropicStreamResponse(res);
    }
    return wrapAnthropicResponse(res);
  }

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

/**
 * Llama al primer proveedor. Si devuelve 401/402/403/404 (sin saldo / clave inválida /
 * modelo no disponible en ese proveedor), descarta su respuesta y reintenta con el
 * siguiente proveedor configurado. Esto garantiza que si OpenRouter está sin saldo y
 * OpenAI sí tiene, la app sigue funcionando sin que el usuario lo note.
 */
export async function postChatCompletions(body: ChatCompletionsBody): Promise<Response> {
  const routes = resolveAllAiRoutes(body.model);
  if (routes.length === 0) {
    return new Response(JSON.stringify({ error: "ai_not_configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let lastRes: Response | null = null;
  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    const res = await callRoute(route, body);
    if (res.ok) {
      // En el primer intento exitoso devolvemos directo (preserva stream).
      return res;
    }
    if (!isProviderFatalForFallback(res.status) || i === routes.length - 1) {
      // No es fallback-able o ya no hay más proveedores: devolvemos este error.
      return res;
    }
    // Consumimos y descartamos el body para no dejar fugas y poder reintentar.
    try {
      await res.text();
    } catch {
      /* noop */
    }
    lastRes = res;
    logDev("gafcore_ai_fallback", {
      from: route.provider,
      status: res.status,
      model: route.modelSlug,
    });
  }
  // Defensivo: si por alguna razón se sale del loop sin return, devuelve último.
  return (
    lastRes ??
    new Response(JSON.stringify({ error: "ai_not_configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  );
}
