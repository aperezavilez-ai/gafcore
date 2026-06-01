import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export function assertGafcoreSupabaseClient(
  client: SupabaseClient<Database> | null | undefined,
): asserts client is SupabaseClient<Database> {
  if (!client) {
    throw new Error("Supabase client not initialized");
  }
  if (typeof client.auth?.getSession !== "function") {
    throw new Error("Supabase client not initialized (auth unavailable)");
  }
}

/** Import dinámico: evita createClient undefined en vendor-heavy / manualChunks. */
export async function loadSupabaseCreateClient(): Promise<
  typeof import("@supabase/supabase-js").createClient
> {
  const mod = await import("@supabase/supabase-js");
  const fn = mod.createClient ?? (mod as { default?: { createClient?: typeof mod.createClient } }).default?.createClient;
  if (typeof fn !== "function") {
    throw new Error(
      "[GafCore] @supabase/supabase-js no expone createClient tras import(). Redeploy o «bun install».",
    );
  }
  return fn;
}
