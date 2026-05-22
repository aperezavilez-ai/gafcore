import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { extensionsEnabled, parseExtensionManifest } from "@/extensions/extension-host.server";
import type { ExtensionManifest } from "@/extensions/manifests.shared";

type AgentManifest = Extract<ExtensionManifest, { kind: "agent" }>;

export type AgentWorkflowEvent = "workflow_complete" | "workflow_failed";

const WEBHOOK_TIMEOUT_MS = 15_000;

export async function invokeAgentWebhook(
  webhookUrl: string,
  payload: Record<string, unknown>,
): Promise<{ ok: true; status: number; body: unknown } | { ok: false; error: string; status?: number }> {
  const secret = process.env.GAFCORE_AGENT_WEBHOOK_SECRET?.trim();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers["X-Gafcore-Agent-Secret"] = secret;

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    let body: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = { raw: text.slice(0, 2000) };
      }
    }
    if (!res.ok) {
      return { ok: false, error: "webhook_http_error", status: res.status };
    }
    return { ok: true, status: res.status, body };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "webhook_failed";
    return { ok: false, error: msg };
  }
}

async function loadUserAgentManifests(userId: string): Promise<
  Array<{ listingId: string; manifest: AgentManifest }>
> {
  if (!extensionsEnabled()) return [];

  const { data: installs } = await supabaseAdmin
    .from("gafcore_extension_installs")
    .select("listing_id, version_id")
    .eq("user_id", userId)
    .eq("kind", "agent");

  const out: Array<{ listingId: string; manifest: AgentManifest }> = [];
  for (const row of installs ?? []) {
    const { data: ver } = await supabaseAdmin
      .from("gafcore_extension_versions")
      .select("manifest_json")
      .eq("id", row.version_id)
      .maybeSingle();
    if (!ver?.manifest_json) continue;
    try {
      const manifest = parseExtensionManifest(ver.manifest_json);
      if (manifest.kind !== "agent" || manifest.runner !== "webhook" || !manifest.webhookUrl) {
        continue;
      }
      out.push({ listingId: row.listing_id, manifest });
    } catch {
      continue;
    }
  }
  return out;
}

/** Notifica a agentes instalados con el hook indicado (fire-and-forget en workflow). */
export async function notifyUserAgentsWorkflowEvent(
  userId: string,
  event: AgentWorkflowEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  const agents = await loadUserAgentManifests(userId);
  const hook = event;
  const tasks = agents
    .filter((a) => a.manifest.hooks.includes(hook))
    .map(async (a) => {
      const result = await invokeAgentWebhook(a.manifest.webhookUrl!, {
        event: hook,
        agentId: a.manifest.slug,
        agentName: a.manifest.name,
        ...payload,
      });
      if (!result.ok) {
        console.warn("[extensions] agent webhook:", a.manifest.slug, result.error);
      }
    });
  await Promise.allSettled(tasks);
}

export async function testUserAgentWebhook(
  userId: string,
  listingId: string,
): Promise<
  | { ok: true; status: number; body: unknown }
  | { ok: false; error: string }
> {
  const { data: install } = await supabaseAdmin
    .from("gafcore_extension_installs")
    .select("version_id")
    .eq("user_id", userId)
    .eq("listing_id", listingId)
    .eq("kind", "agent")
    .maybeSingle();

  if (!install?.version_id) return { ok: false, error: "not_installed" };

  const { data: ver } = await supabaseAdmin
    .from("gafcore_extension_versions")
    .select("manifest_json")
    .eq("id", install.version_id)
    .maybeSingle();

  if (!ver?.manifest_json) return { ok: false, error: "manifest_missing" };

  let manifest: AgentManifest;
  try {
    const parsed = parseExtensionManifest(ver.manifest_json);
    if (parsed.kind !== "agent") return { ok: false, error: "not_agent" };
    manifest = parsed;
  } catch {
    return { ok: false, error: "invalid_manifest" };
  }

  if (!manifest.webhookUrl) return { ok: false, error: "webhook_url_missing" };

  const result = await invokeAgentWebhook(manifest.webhookUrl, {
    event: "test",
    agentId: manifest.slug,
    agentName: manifest.name,
    message: "Prueba desde GafCore Marketplace",
    at: new Date().toISOString(),
  });

  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, status: result.status, body: result.body };
}
