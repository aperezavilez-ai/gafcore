/**
 * Cliente Supabase en el navegador. Si el build no trajo VITE_* (común en Vercel),
 * las lee de GET /api/gafcore/client-env (solo claves públicas).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  assertGafcoreSupabaseClient,
  resolveSupabaseCreateClient,
} from "@/lib/gafcore-supabase-create.shared";
import {
  GAFCORE_SUPABASE_ENV_HINT,
  isViteSupabaseConfigured,
  resolveSupabasePublishableKeyFromViteEnv,
  resolveSupabaseUrlFromViteEnv,
} from "@/lib/gafcore-supabase-env.shared";

export type GafcorePublicClientEnv = { url: string; publishableKey: string };

let cachedEnv: GafcorePublicClientEnv | null = null;
let browserClient: SupabaseClient<Database> | null = null;

export async function fetchGafcorePublicClientEnv(): Promise<GafcorePublicClientEnv | null> {
  if (cachedEnv) return cachedEnv;
  const url = resolveSupabaseUrlFromViteEnv();
  const publishableKey = resolveSupabasePublishableKeyFromViteEnv();
  if (url && publishableKey) {
    cachedEnv = { url, publishableKey };
    return cachedEnv;
  }
  try {
    const res = await fetch("/api/gafcore/client-env", { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { ok?: boolean; url?: string; publishableKey?: string };
    if (!body.ok || !body.url?.trim() || !body.publishableKey?.trim()) return null;
    cachedEnv = { url: body.url.trim(), publishableKey: body.publishableKey.trim() };
    return cachedEnv;
  } catch {
    return null;
  }
}

export async function isSupabaseReadyOnClient(): Promise<boolean> {
  if (isViteSupabaseConfigured()) return true;
  return Boolean(await fetchGafcorePublicClientEnv());
}

/** @deprecated use isViteSupabaseConfigured — alias para código legacy */
export function isSupabaseConfigured(): boolean {
  return isViteSupabaseConfigured();
}

export async function getGafcoreSupabaseBrowser(): Promise<SupabaseClient<Database>> {
  if (browserClient) {
    assertGafcoreSupabaseClient(browserClient);
    return browserClient;
  }

  const env = await fetchGafcorePublicClientEnv();
  if (!env?.url || !env.publishableKey) {
    throw new Error(`Supabase no disponible. ${GAFCORE_SUPABASE_ENV_HINT}`);
  }

  const createClient = resolveSupabaseCreateClient();
  const client = createClient(env.url, env.publishableKey, {
    auth: {
      storage: typeof window !== "undefined" ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  assertGafcoreSupabaseClient(client);
  browserClient = client;
  return browserClient;
}
