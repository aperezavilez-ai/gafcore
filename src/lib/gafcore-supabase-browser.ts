/**
 * Cliente Supabase en el navegador. Si el build no trajo VITE_* (común en Vercel),
 * las lee de GET /api/gafcore/client-env (solo claves públicas).
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { isSupabaseConfigured } from "@/lib/supabase-env.shared";

export type GafcorePublicClientEnv = { url: string; publishableKey: string };

let cachedEnv: GafcorePublicClientEnv | null = null;
let browserClient: ReturnType<typeof createClient<Database>> | null = null;

export async function fetchGafcorePublicClientEnv(): Promise<GafcorePublicClientEnv | null> {
  if (cachedEnv) return cachedEnv;
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
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
  if (isSupabaseConfigured()) return true;
  return Boolean(await fetchGafcorePublicClientEnv());
}

export async function getGafcoreSupabaseBrowser() {
  if (browserClient) return browserClient;
  const env = await fetchGafcorePublicClientEnv();
  if (!env) {
    throw new Error(
      "Supabase no disponible. Configura VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en Vercel (Build + Production) y redeploy.",
    );
  }
  browserClient = createClient<Database>(env.url, env.publishableKey, {
    auth: {
      storage: typeof window !== "undefined" ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return browserClient;
}
