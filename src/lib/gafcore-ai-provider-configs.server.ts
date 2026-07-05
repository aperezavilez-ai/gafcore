import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  detectModelFamily,
  normalizeModelSlug,
  type AiWireApi,
  type ResolvedProvider,
  type ResolvedRoute,
} from "@/lib/gafcore-model-routing.shared";
import { GPTPRO4ALL_API_DEFAULT_MODEL } from "@/lib/gafcore-chat.shared";
import { GAFCORE_ANTHROPIC_MODEL_DEFAULT } from "@/lib/gafcore-assistant-prompt.shared";
import { logDev } from "@/lib/gafcore-logger.server";

type ProviderConfigRow = {
  id: string;
  provider: ResolvedProvider;
  label: string | null;
  base_url: string | null;
  default_model: string | null;
  wire_api: AiWireApi | null;
  priority: number | null;
  is_active: boolean | null;
  api_key_hint: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ProviderConfigDb = {
  from(table: "gafcore_ai_provider_configs"): {
    select(columns: string): {
      order(column: string, opts?: { ascending?: boolean }): Promise<{ data: ProviderConfigRow[] | null; error: { code?: string; message: string } | null }>;
      eq(column: string, value: unknown): {
        order(column: string, opts?: { ascending?: boolean }): Promise<{ data: ProviderConfigRow[] | null; error: { code?: string; message: string } | null }>;
      };
    };
    insert(values: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
    update(values: Record<string, unknown>): {
      eq(column: string, value: unknown): Promise<{ data: unknown; error: { message: string } | null }>;
    };
    delete(): {
      eq(column: string, value: unknown): Promise<{ data: unknown; error: { message: string } | null }>;
    };
  };
  rpc(name: "decrypt_gafcore_ai_provider_key", args: { p_config_id: string }): Promise<{ data: string | null; error: { message: string } | null }>;
};

type ProviderConfigQueryResult = {
  data: ProviderConfigRow[] | null;
  error: { code?: string; message: string } | null;
};

const providerDefaults: Record<ResolvedProvider, { baseUrl: string; model: string; wireApi: AiWireApi }> = {
  gptpro4all: {
    baseUrl: "https://api.chatgptpro4all.com/v1",
    model: GPTPRO4ALL_API_DEFAULT_MODEL,
    wireApi: "responses",
  },
  anthropic: {
    baseUrl: "https://api.anthropic.com/v1/messages",
    model: GAFCORE_ANTHROPIC_MODEL_DEFAULT,
    wireApi: "chat_completions",
  },
  openai: {
    baseUrl: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
    wireApi: "chat_completions",
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    model: "openai/gpt-4o-mini",
    wireApi: "chat_completions",
  },
  custom: {
    baseUrl: "",
    model: "",
    wireApi: "chat_completions",
  },
};

function db(): ProviderConfigDb {
  return supabaseAdmin as unknown as ProviderConfigDb;
}

function isMissingConfigStorage(error: { code?: string; message: string } | null | undefined): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /gafcore_ai_provider_configs|relation .* does not exist|schema cache/i.test(error.message)
  );
}

function normalizeChatCompletionsUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return trimmed;
  try {
    const url = new URL(trimmed);
    const path = url.pathname.replace(/\/+$/g, "");
    if (!path || path === "/" || path === "/v1") {
      url.pathname = "/v1/chat/completions";
      return url.toString();
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}

function normalizeResponsesUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) return trimmed;
  try {
    const url = new URL(trimmed);
    const path = url.pathname.replace(/\/+$/g, "");
    if (!path || path === "/" || path === "/v1" || path === "/v1/chat/completions") {
      url.pathname = "/v1/responses";
      return url.toString();
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}

function modelForProvider(row: ProviderConfigRow, modelHint?: string): string {
  const provider = row.provider;
  const family = modelHint ? detectModelFamily(modelHint) : "other";
  const configured = row.default_model?.trim();
  if (modelHint?.trim() && provider !== "anthropic") {
    return normalizeModelSlug(modelHint, provider);
  }
  if (modelHint?.trim() && provider === "anthropic" && family === "claude") {
    return normalizeModelSlug(modelHint, "anthropic");
  }
  return configured || providerDefaults[provider].model;
}

function routeUrlForProvider(row: ProviderConfigRow): string {
  const base = row.base_url?.trim() || providerDefaults[row.provider].baseUrl;
  const wireApi = row.wire_api || providerDefaults[row.provider].wireApi;
  if (row.provider === "anthropic") return "https://api.anthropic.com/v1/messages";
  if (wireApi === "responses") return normalizeResponsesUrl(base);
  return normalizeChatCompletionsUrl(base);
}

export type AdminAiProviderConfig = {
  id: string;
  provider: ResolvedProvider;
  label: string;
  baseUrl: string;
  defaultModel: string;
  wireApi: AiWireApi;
  priority: number;
  isActive: boolean;
  apiKeyHint: string;
  createdAt: string;
  updatedAt: string;
};

export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) return "*".repeat(trimmed.length);
  return `${trimmed.slice(0, 4)}${"*".repeat(Math.max(trimmed.length - 8, 4))}${trimmed.slice(-4)}`;
}

export async function listGafcoreAiProviderConfigs(): Promise<AdminAiProviderConfig[]> {
  const { data, error } = await db()
    .from("gafcore_ai_provider_configs")
    .select("id,provider,label,base_url,default_model,wire_api,priority,is_active,api_key_hint,created_at,updated_at")
    .order("priority", { ascending: true });
  if (error) {
    if (isMissingConfigStorage(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    provider: row.provider,
    label: row.label?.trim() || row.provider,
    baseUrl: row.base_url?.trim() || providerDefaults[row.provider].baseUrl,
    defaultModel: row.default_model?.trim() || providerDefaults[row.provider].model,
    wireApi: row.wire_api || providerDefaults[row.provider].wireApi,
    priority: row.priority ?? 100,
    isActive: row.is_active ?? true,
    apiKeyHint: row.api_key_hint?.trim() || "",
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
  }));
}

export async function listActiveGafcoreAiProviderRoutes(modelHint?: string): Promise<ResolvedRoute[]> {
  let result: ProviderConfigQueryResult;
  try {
    result = await db()
      .from("gafcore_ai_provider_configs")
      .select("id,provider,label,base_url,default_model,wire_api,priority,is_active,api_key_hint,created_at,updated_at")
      .eq("is_active", true)
      .order("priority", { ascending: true });
  } catch (err) {
    logDev("gafcore_ai_provider_configs_unavailable", {
      message: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
  const { data, error } = result;
  if (error) {
    if (!isMissingConfigStorage(error)) {
      logDev("gafcore_ai_provider_configs_unavailable", { message: error.message });
    }
    return [];
  }

  const routes: ResolvedRoute[] = [];
  for (const row of data ?? []) {
    const { data: apiKey, error: keyError } = await db().rpc("decrypt_gafcore_ai_provider_key", {
      p_config_id: row.id,
    });
    if (keyError || !apiKey?.trim()) {
      logDev("gafcore_ai_provider_key_unavailable", {
        provider: row.provider,
        message: keyError?.message ?? "empty key",
      });
      continue;
    }
    const provider = row.provider;
    const wireApi = row.wire_api || providerDefaults[provider].wireApi;
    routes.push({
      provider,
      url: routeUrlForProvider(row),
      apiKey: apiKey.trim(),
      extraHeaders:
        provider === "openrouter"
          ? {
              "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER?.trim() || "https://gafcore.com",
              "X-Title": process.env.OPENROUTER_APP_TITLE?.trim() || "GafCore",
            }
          : {},
      modelSlug: modelForProvider(row, modelHint),
      wireApi,
    });
  }
  return routes;
}

export async function saveGafcoreAiProviderConfig(input: {
  id?: string;
  provider: ResolvedProvider;
  label?: string;
  baseUrl?: string;
  defaultModel?: string;
  wireApi?: AiWireApi;
  priority?: number;
  isActive?: boolean;
  apiKey?: string;
  userId: string;
}): Promise<void> {
  const provider = input.provider;
  const values: Record<string, unknown> = {
    provider,
    label: input.label?.trim() || provider,
    base_url: input.baseUrl?.trim() || providerDefaults[provider].baseUrl,
    default_model: input.defaultModel?.trim() || providerDefaults[provider].model,
    wire_api: input.wireApi || providerDefaults[provider].wireApi,
    priority: input.priority ?? 100,
    is_active: input.isActive ?? true,
    updated_by: input.userId,
  };
  if (input.apiKey?.trim()) values.api_key = input.apiKey.trim();

  if (input.id) {
    const { error } = await db().from("gafcore_ai_provider_configs").update(values).eq("id", input.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await db().from("gafcore_ai_provider_configs").insert({
    ...values,
    created_by: input.userId,
  });
  if (error) throw new Error(error.message);
}

export async function deleteGafcoreAiProviderConfig(id: string): Promise<void> {
  const { error } = await db().from("gafcore_ai_provider_configs").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

async function fetchProviderProbe(
  route: ResolvedRoute,
): Promise<{ ok: boolean; status: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  const model = route.modelSlug?.trim();

  try {
    if (route.provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": route.apiKey,
          "anthropic-version": "2023-06-01",
          ...route.extraHeaders,
        },
        body: JSON.stringify({
          model,
          max_tokens: 8,
          messages: [{ role: "user", content: "Responde solo OK." }],
        }),
      });
      return { ok: res.ok, status: res.status };
    }

    if (route.wireApi === "responses") {
      const res = await fetch(route.url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${route.apiKey}`,
          ...route.extraHeaders,
        },
        body: JSON.stringify({
          ...(model ? { model } : {}),
          input: "Responde solo OK.",
          max_output_tokens: 8,
        }),
      });
      return { ok: res.ok, status: res.status };
    }

    const res = await fetch(route.url, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${route.apiKey}`,
        ...route.extraHeaders,
      },
      body: JSON.stringify({
        ...(model ? { model } : {}),
        messages: [{ role: "user", content: "Responde solo OK." }],
        max_tokens: 8,
        temperature: 0,
      }),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    logDev("gafcore_ai_provider_probe_failed", {
      provider: route.provider,
      model: route.modelSlug,
      message: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timeout);
  }
}

export async function testGafcoreAiProviderRoute(id: string): Promise<{ ok: boolean; message: string }> {
  const configs = await listGafcoreAiProviderConfigs();
  const config = configs.find((c) => c.id === id);
  if (!config) return { ok: false, message: "Configuracion no encontrada." };
  const routes = await listActiveGafcoreAiProviderRoutes(config.defaultModel);
  const route = routes.find((r) => r.provider === config.provider && r.modelSlug === config.defaultModel) ?? routes[0];
  if (!route) return { ok: false, message: "No hay llave activa para probar." };
  const probe = await fetchProviderProbe(route);
  if (!probe.ok) {
    const detail = probe.status > 0 ? `HTTP ${probe.status}` : "sin respuesta";
    return {
      ok: false,
      message: `La API no respondio correctamente (${detail}). Revisa saldo, llave o modelo.`,
    };
  }
  return { ok: true, message: `API activa y con respuesta: ${route.provider} / ${route.modelSlug}.` };
}
