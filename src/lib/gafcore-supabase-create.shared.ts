/**
 * createClient robusto: evita «Cannot read properties of undefined (reading 'create')»
 * cuando el bundler deja el named export vacío (chunk vendor-supabase).
 */
import * as SupabaseJs from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type CreateClientFn = (
  url: string,
  key: string,
  options?: Parameters<typeof SupabaseJs.createClient>[2],
) => SupabaseClient<Database>;

export function resolveSupabaseCreateClient(): CreateClientFn {
  const mod = SupabaseJs as typeof SupabaseJs & {
    default?: { createClient?: CreateClientFn };
  };
  const fn = mod.createClient ?? mod.default?.createClient;
  if (typeof fn !== "function") {
    throw new Error(
      "[GafCore] @supabase/supabase-js no expone createClient. Ejecuta «bun install» y redeploy; si persiste, reporta el build.",
    );
  }
  return fn as CreateClientFn;
}

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
