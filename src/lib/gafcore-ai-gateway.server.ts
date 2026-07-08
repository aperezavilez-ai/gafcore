/**
 * Gateway unificado de IA GafCore — config, modelos, upstream y créditos.
 * Todos los flujos servidor deben usar este módulo en lugar de llamar al proveedor directamente.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getAiChatConfig,
  postChatCompletions,
  type AiChatConfig,
} from "@/lib/ai-chat-completions.server";
import {
  pickModel,
  resolveGafcoreModelDefaults,
  type GafcoreChatMessage,
} from "@/lib/gafcore-chat.shared";
import { logDev } from "@/lib/gafcore-logger.server";

export type AiModelTier = "fast" | "deep" | "support";

export type GafcoreAiModels = {
  fast: string;
  deep: string;
  support: string;
  ui: string;
};

export type GafcoreAiGateway = {
  config: AiChatConfig;
  models: GafcoreAiModels;
};

export type UpstreamFailure = {
  status: number;
  code: "rate_limited" | "provider_credits" | "upstream" | "not_configured";
  message: string;
  detail: string;
};

export function getGafcoreAiGateway(): GafcoreAiGateway {
  const config = getAiChatConfig();
  const defaults = resolveGafcoreModelDefaults(config.url || undefined);
  const fast = process.env.AI_MODEL_FAST?.trim() || defaults.fast;
  const deep = process.env.AI_MODEL_DEEP?.trim() || defaults.deep;
  const ui = process.env.AI_MODEL_UI?.trim() || defaults.ui;
  const support = process.env.AI_SUPPORT_MODEL?.trim() || fast;
  return { config, models: { fast, deep, support, ui } };
}

export function tryGetGafcoreAiGateway(): GafcoreAiGateway | null {
  try {
    return getGafcoreAiGateway();
  } catch {
    return null;
  }
}

export function isGafcoreProxyAiGateway(gateway: GafcoreAiGateway | null | undefined): boolean {
  if (!gateway) return false;
  const url = gateway.config.url.toLowerCase();
  return (
    /\/api\/proxy(?:\/|$)/i.test(url) &&
    Boolean(gateway.config.extraHeaders["x-project-key"]) &&
    Boolean(gateway.config.extraHeaders["x-provider-id"])
  );
}

export function resolveGatewayModel(
  gateway: GafcoreAiGateway,
  opts: {
    tier?: AiModelTier;
    explicit?: string;
    instruction?: string;
    hasVision?: boolean;
  } = {},
): string {
  if (opts.explicit?.trim()) return opts.explicit.trim();
  const { models } = gateway;
  if (opts.tier === "support") return models.support;
  if (opts.tier === "deep") return models.deep;
  if (opts.tier === "fast") return models.fast;
  if (opts.instruction) {
    return pickModel(
      opts.instruction,
      models.fast,
      models.deep,
      Boolean(opts.hasVision),
      models.ui,
    );
  }
  return models.fast;
}

/** Reintentos transitorios (529, 5xx) en {@link postChatCompletions} → `callRoute`. */
export async function upstreamChatCompletions(body: Record<string, unknown>): Promise<Response> {
  const model = typeof body.model === "string" ? body.model : "unknown";
  const t0 = Date.now();
  const res = await postChatCompletions(body);
  if (!res.ok) {
    logDev("gafcore_ai_upstream_error", { status: res.status, model, ms: Date.now() - t0 });
  }
  return res;
}

export async function parseUpstreamFailure(res: Response): Promise<UpstreamFailure> {
  const detail = (await res.text().catch(() => "")).slice(0, 400);
  if (res.status === 429) {
    return {
      status: 429,
      code: "rate_limited",
      message: "Límite alcanzado, intenta en un momento.",
      detail,
    };
  }
  if (res.status === 402) {
    return {
      status: 402,
      code: "provider_credits",
      message: "Sin créditos de IA en el proveedor.",
      detail,
    };
  }
  if (res.status === 529) {
    return {
      status: 529,
      code: "upstream",
      message: "El proveedor de IA está sobrecargado. Intenta de nuevo en un momento.",
      detail,
    };
  }
  return {
    status: res.status >= 400 ? res.status : 502,
    code: "upstream",
    message: "No se pudo obtener respuesta del asistente.",
    detail,
  };
}

export type CreditConsumeResult =
  | { ok: true; skipped: true }
  | { ok: true; skipped: false; balance: number | null }
  | { ok: false; error: "credits_error" | "insufficient_credits" };

export async function consumeAiCredits(
  userId: string,
  amount: number,
  reason: string,
  metadata?: Record<string, unknown>,
): Promise<CreditConsumeResult> {
  const { data: credit, error } = await supabaseAdmin.rpc("consume_credits", {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason,
    p_metadata: (metadata ?? {}) as never,
  });
  if (error) {
    console.error("[ai-gateway] consume_credits:", error);
    return { ok: false, error: "credits_error" };
  }
  if (!(credit as { ok?: boolean } | null)?.ok) {
    return { ok: false, error: "insufficient_credits" };
  }
  return {
    ok: true,
    skipped: false,
    balance: (credit as { balance?: number } | null)?.balance ?? null,
  };
}

export async function refundAiCredits(
  userId: string,
  amount: number,
  reason: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await supabaseAdmin.rpc("add_credits", {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason,
    p_metadata: (metadata ?? {}) as never,
  });
}

export async function completeChatMessage(input: {
  model: string;
  messages: GafcoreChatMessage[] | Array<{ role: string; content: string }>;
  temperature?: number;
  json?: boolean;
  maxTokens?: number;
}): Promise<{ content: string; raw: unknown; finishReason: string | null; truncated: boolean }> {
  const body: Record<string, unknown> = {
    model: input.model,
    messages: input.messages,
    temperature: input.temperature ?? 0.7,
  };
  if (input.json) body.response_format = { type: "json_object" };
  if (typeof input.maxTokens === "number") body.max_tokens = input.maxTokens;

  const res = await upstreamChatCompletions(body);
  if (!res.ok) {
    const fail = await parseUpstreamFailure(res);
    const err = new Error(fail.message) as Error & { code?: string; status?: number };
    err.code = fail.code;
    err.status = fail.status;
    throw err;
  }

  const raw = await res.json();
  const choice = (raw as { choices?: Array<{ message?: { content?: string }; finish_reason?: string }> })
    ?.choices?.[0];
  const content: string = choice?.message?.content ?? "";
  const finishReason = choice?.finish_reason ?? null;
  // OpenAI: "length"; Anthropic (mapeado en wrapAnthropicResponse): "max_tokens".
  const truncated = finishReason === "length" || finishReason === "max_tokens";
  return { content, raw, finishReason, truncated };
}

export async function streamChatCompletions(input: {
  model: string;
  messages: GafcoreChatMessage[] | Array<{ role: string; content: string }>;
  json?: boolean;
  maxTokens?: number;
}): Promise<Response> {
  const body: Record<string, unknown> = {
    model: input.model,
    messages: input.messages,
    stream: true,
  };
  if (input.json) body.response_format = { type: "json_object" };
  // Mismo techo que completeChatMessage: el stream de un build (JSON con files)
  // supera el default 8192 y se cortaría a mitad de archivo.
  if (typeof input.maxTokens === "number") body.max_tokens = input.maxTokens;
  return upstreamChatCompletions(body);
}
