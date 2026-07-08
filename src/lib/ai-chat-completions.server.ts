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
import {
  GAFCORE_ANTHROPIC_API_VERSION,
  GAFCORE_ANTHROPIC_MODEL_DEFAULT,
  GAFCORE_ANTHROPIC_MODEL_RETIRED,
} from "@/lib/gafcore-assistant-prompt.shared";
import {
  resolveAiRoute,
  resolveAllAiRoutesForRequest,
  type ResolvedRoute,
} from "@/lib/gafcore-model-routing.server";
import { logDev } from "@/lib/gafcore-logger.server";
import { withTransientUpstreamRetry } from "@/lib/gafcore-ai-upstream-retry.server";

/**
 * Timeout por llamada individual al proveedor de IA (no por intento del
 * agente completo). Sin esto, una sola llamada lenta puede consumir todo
 * el presupuesto antes de que el bucle de reintentos del agente o de red
 * tengan oportunidad de fallar limpio y reintentar.
 *
 * Peor caso realista del endpoint complete (edición de proyecto):
 *   agente MAX_ATTEMPTS(3) × 1 fetch correcto × T(60s) ≈ 180 s,
 * bajo el maxDuration=300 s de la función en Vercel (vite.config.ts →
 * nitro.vercel.functionRules). El caso degenerado (reintentos de red por
 * 5xx en cada intento) queda acotado por ese mismo maxDuration. Si subes T
 * o MAX_ATTEMPTS, recalcula para no rebasar los 300 s.
 *
 * El timeout de streaming es más generoso porque ahí el límite que importa
 * es el primer byte/chunk, no la duración total de la conexión.
 */
const AI_UPSTREAM_REQUEST_TIMEOUT_MS = 60_000;
const AI_UPSTREAM_STREAM_TIMEOUT_MS = 150_000;
const ALLOWED_AI_HOSTS = new Set([
  "api.meai.cloud",
  "api.chatgptpro4all.com",
  "openrouter.ai",
  "generativelanguage.googleapis.com",
]);

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

  const rf = body.response_format;
  const wantsJson =
    rf &&
    typeof rf === "object" &&
    (rf as { type?: string }).type === "json_object";
  if (wantsJson) {
    systemParts.push(
      "Responde con un único objeto JSON válido. Sin markdown, sin texto antes ni después del JSON.",
    );
  }

  const anthropicModel = GAFCORE_ANTHROPIC_MODEL_RETIRED.has(modelSlug)
    ? GAFCORE_ANTHROPIC_MODEL_DEFAULT
    : modelSlug;

  const maxTokens = typeof body.max_tokens === "number" ? body.max_tokens : 8192;
  const out: Record<string, unknown> = {
    model: anthropicModel,
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
      let stopReason: string | null = null;
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
                delta?: { type?: string; text?: string; stop_reason?: string };
              };
              if (
                parsed.type === "content_block_delta" &&
                parsed.delta?.type === "text_delta" &&
                parsed.delta.text
              ) {
                const chunk = { choices: [{ delta: { content: parsed.delta.text } }] };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
              } else if (parsed.type === "message_delta" && parsed.delta?.stop_reason) {
                // Anthropic emite stop_reason en message_delta. Lo propagamos como
                // finish_reason OpenAI para que el cliente detecte truncación.
                stopReason = parsed.delta.stop_reason;
              }
            } catch {
              /* línea parcial SSE */
            }
          }
        }
        if (stopReason) {
          const finishReason = stopReason === "max_tokens" ? "length" : stopReason;
          const tail = { choices: [{ delta: {}, finish_reason: finishReason }] };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(tail)}\n\n`));
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

function messageContentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const p = part as { type?: string; text?: string; image_url?: { url?: string } };
      if (typeof p.text === "string") return p.text;
      if (p.image_url?.url) return `[imagen: ${p.image_url.url}]`;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function toResponsesBody(body: ChatCompletionsBody, modelSlug: string): Record<string, unknown> {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const instructions: string[] = [];
  const input: Array<{ role: string; content: string }> = [];

  for (const m of messages as Array<{ role: string; content: unknown }>) {
    if (!m || typeof m !== "object") continue;
    const text = messageContentToText(m.content);
    if (!text.trim()) continue;
    if (m.role === "system") {
      instructions.push(text);
      continue;
    }
    if (m.role === "user" || m.role === "assistant") {
      input.push({ role: m.role, content: text });
    }
  }

  const rf = body.response_format;
  const wantsJson =
    rf &&
    typeof rf === "object" &&
    (rf as { type?: string }).type === "json_object";
  if (wantsJson) {
    instructions.push(
      "Responde con un unico objeto JSON valido. Sin markdown, sin texto antes ni despues del JSON.",
    );
  }

  const out: Record<string, unknown> = {
    model: modelSlug,
    input: input.length > 0 ? input : "",
  };
  if (instructions.length) out.instructions = instructions.join("\n\n");
  if (typeof body.temperature === "number") out.temperature = body.temperature;
  if (typeof body.max_tokens === "number") out.max_output_tokens = body.max_tokens;
  if (body.stream) out.stream = true;
  return out;
}

function extractResponsesText(json: unknown): string {
  const direct = (json as { output_text?: unknown } | null)?.output_text;
  if (typeof direct === "string") return direct;

  const output = (json as { output?: unknown } | null)?.output;
  if (!Array.isArray(output)) return "";

  const parts: string[] = [];
  for (const item of output as Array<{ type?: string; content?: unknown }>) {
    const content = item?.content;
    if (!Array.isArray(content)) continue;
    for (const c of content as Array<{ type?: string; text?: unknown }>) {
      if (typeof c?.text === "string") parts.push(c.text);
    }
  }
  return parts.join("");
}

async function wrapResponsesApiResponse(res: Response): Promise<Response> {
  if (!res.ok) return res;
  const json = (await res.json().catch(() => null)) as unknown;
  if (!json) {
    return new Response(JSON.stringify({ error: "responses_invalid_response" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  const text = extractResponsesText(json);
  const openaiShape = {
    id: (json as { id?: string } | null)?.id ?? `responses-${Date.now()}`,
    object: "chat.completion",
    model: (json as { model?: string } | null)?.model ?? "gptpro4all",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: "stop",
      },
    ],
    usage: (json as { usage?: unknown } | null)?.usage ?? undefined,
  };

  return new Response(JSON.stringify(openaiShape), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function wrapResponsesApiStreamResponse(res: Response): Response {
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
              const parsed = JSON.parse(payload) as { type?: string; delta?: string };
              if (parsed.type === "response.output_text.delta" && typeof parsed.delta === "string") {
                const chunk = { choices: [{ delta: { content: parsed.delta } }] };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
              }
            } catch {
              /* linea parcial SSE */
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
  return (
    status === 400 ||
    status === 401 ||
    status === 402 ||
    status === 403 ||
    status === 404 ||
    status === 422 ||
    status === 429 ||
    status >= 500
  );
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const isAbort =
      err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
    logDev("gafcore_ai_upstream_fetch_failed", {
      url: sanitizeAiUrlForLog(url),
      isAbort,
      message: err instanceof Error ? err.message : String(err),
    });
    return new Response(
      JSON.stringify({
        error: isAbort ? "upstream_timeout" : "upstream_fetch_failed",
      }),
      { status: 504, headers: { "Content-Type": "application/json" } },
    );
  }
}

function sanitizeAiUrlForLog(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    if (url.searchParams.has("key")) url.searchParams.set("key", "[redacted]");
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function isAllowedAiUrl(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return ALLOWED_AI_HOSTS.has(host) || host.endsWith(".aiplatform.googleapis.com");
  } catch {
    return false;
  }
}

function blockedAiUrlResponse(rawUrl: string): Response {
  return new Response(
    JSON.stringify({
      error: "ai_url_not_allowed",
      detail: `API no permitida para GafCore: ${sanitizeAiUrlForLog(rawUrl)}`,
    }),
    { status: 403, headers: { "Content-Type": "application/json" } },
  );
}

function geminiTextFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const p = part as { text?: string; image_url?: { url?: string } };
      if (typeof p.text === "string") return p.text;
      if (p.image_url?.url) return `[imagen: ${p.image_url.url}]`;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function toGeminiBody(body: ChatCompletionsBody): Record<string, unknown> {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const systemParts: string[] = [];
  const contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }> = [];

  for (const m of messages as Array<{ role?: string; content?: unknown }>) {
    if (!m || typeof m !== "object") continue;
    const text = geminiTextFromContent(m.content);
    if (!text.trim()) continue;
    if (m.role === "system") {
      systemParts.push(text);
      continue;
    }
    if (m.role === "assistant") {
      contents.push({ role: "model", parts: [{ text }] });
      continue;
    }
    contents.push({ role: "user", parts: [{ text }] });
  }

  const generationConfig: Record<string, unknown> = {};
  if (typeof body.temperature === "number") generationConfig.temperature = body.temperature;
  if (typeof body.max_tokens === "number") generationConfig.maxOutputTokens = body.max_tokens;
  const rf = body.response_format;
  if (rf && typeof rf === "object" && (rf as { type?: string }).type === "json_object") {
    generationConfig.responseMimeType = "application/json";
  }

  return {
    contents: contents.length ? contents : [{ role: "user", parts: [{ text: "" }] }],
    ...(systemParts.length ? { systemInstruction: { parts: [{ text: systemParts.join("\n\n") }] } } : {}),
    ...(Object.keys(generationConfig).length ? { generationConfig } : {}),
  };
}

function extractGeminiText(json: unknown): string {
  const candidates = (json as { candidates?: unknown } | null)?.candidates;
  if (!Array.isArray(candidates)) return "";
  const first = candidates[0] as { content?: { parts?: unknown } } | undefined;
  const parts = first?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => (typeof (part as { text?: unknown })?.text === "string" ? (part as { text: string }).text : ""))
    .join("");
}

async function wrapGeminiResponse(res: Response, model: string): Promise<Response> {
  if (!res.ok) return res;
  const json = (await res.json().catch(() => null)) as unknown;
  if (!json) {
    return new Response(JSON.stringify({ error: "gemini_invalid_response" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
  const text = extractGeminiText(json);
  const openaiShape = {
    id: `gemini-${Date.now()}`,
    object: "chat.completion",
    model,
    choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
    usage: (json as { usageMetadata?: unknown } | null)?.usageMetadata ?? undefined,
  };
  return new Response(JSON.stringify(openaiShape), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function wrapGeminiStreamResponse(res: Response): Response {
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
              const text = extractGeminiText(JSON.parse(payload));
              if (text) {
                const chunk = { choices: [{ delta: { content: text } }] };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
              }
            } catch {
              /* linea parcial SSE */
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

async function executeRouteFetch(
  route: ResolvedRoute,
  body: ChatCompletionsBody,
): Promise<Response> {
  if (route.wireApi === "gemini_generate_content") {
    const geminiBody = toGeminiBody(body);
    const operation = body.stream ? "streamGenerateContent" : "generateContent";
    const url = `${route.url}/models/${encodeURIComponent(route.modelSlug)}:${operation}?key=${encodeURIComponent(route.apiKey)}${body.stream ? "&alt=sse" : ""}`;
    if (!isAllowedAiUrl(url)) return blockedAiUrlResponse(url);
    const timeoutMs = body.stream ? AI_UPSTREAM_STREAM_TIMEOUT_MS : AI_UPSTREAM_REQUEST_TIMEOUT_MS;
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...route.extraHeaders },
        body: JSON.stringify(geminiBody),
      },
      timeoutMs,
    );
    if (body.stream) return wrapGeminiStreamResponse(res);
    return wrapGeminiResponse(res, route.modelSlug);
  }

  if (route.wireApi === "responses") {
    const responsesBody = toResponsesBody(body, route.modelSlug || String(body.model ?? ""));
    const timeoutMs = responsesBody.stream
      ? AI_UPSTREAM_STREAM_TIMEOUT_MS
      : AI_UPSTREAM_REQUEST_TIMEOUT_MS;
    if (!isAllowedAiUrl(route.url)) return blockedAiUrlResponse(route.url);
    const res = await fetchWithTimeout(
      route.url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${route.apiKey}`,
          ...route.extraHeaders,
        },
        body: JSON.stringify(responsesBody),
      },
      timeoutMs,
    );
    if (responsesBody.stream) return wrapResponsesApiStreamResponse(res);
    return wrapResponsesApiResponse(res);
  }

  const outBody: Record<string, unknown> = { ...body };
  if (route.modelSlug) outBody.model = route.modelSlug;
  const timeoutMs = outBody.stream ? AI_UPSTREAM_STREAM_TIMEOUT_MS : AI_UPSTREAM_REQUEST_TIMEOUT_MS;
  if (!isAllowedAiUrl(route.url)) return blockedAiUrlResponse(route.url);

  return fetchWithTimeout(
    route.url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${route.apiKey}`,
        ...route.extraHeaders,
      },
      body: JSON.stringify(outBody),
    },
    timeoutMs,
  );
}

async function callRoute(route: ResolvedRoute, body: ChatCompletionsBody): Promise<Response> {
  return withTransientUpstreamRetry(
    () => executeRouteFetch(route, body),
    { provider: route.provider, model: route.modelSlug },
  );
}

/**
 * Llama al primer proveedor. Si devuelve 401/402/403/404 (sin saldo / clave inválida /
 * modelo no disponible en ese proveedor), descarta su respuesta y reintenta con el
 * siguiente proveedor configurado. Esto garantiza que si OpenRouter está sin saldo y
 * OpenAI sí tiene, la app sigue funcionando sin que el usuario lo note.
 */
export async function postChatCompletions(body: ChatCompletionsBody): Promise<Response> {
  const routes = await resolveAllAiRoutesForRequest(body.model);
  console.error(
    "GAFCORE_DEBUG_ROUTES",
    JSON.stringify({
      requestedModel: body.model,
      routes: routes.map((r) => ({ provider: r.provider, url: r.url, model: r.modelSlug })),
    }),
  );
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
    console.error(
      "GAFCORE_DEBUG_ATTEMPT",
      JSON.stringify({ index: i, provider: route.provider, url: route.url, status: res.status, ok: res.ok }),
    );
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
