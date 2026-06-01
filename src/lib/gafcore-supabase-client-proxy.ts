/**
 * Sustituto de @/integrations/supabase/client (vía alias en vite.config).
 * El client.ts generado usa import estático de createClient que se rompe con manualChunks.
 * Este proxy arranca getGafcoreSupabaseBrowser() (import dinámico) antes del primer uso.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getGafcoreSupabaseBrowser } from "@/lib/gafcore-supabase-browser";

let client: SupabaseClient<Database> | undefined;
let bootPromise: Promise<SupabaseClient<Database>> | undefined;

function bootClient(): Promise<SupabaseClient<Database>> {
  if (client) return Promise.resolve(client);
  if (!bootPromise) {
    bootPromise = getGafcoreSupabaseBrowser().then((c) => {
      client = c;
      return c;
    });
  }
  return bootPromise;
}

if (typeof window !== "undefined") {
  void bootClient().catch((err) => {
    console.error("[Supabase] No se pudo inicializar el cliente", err);
  });
}

function requireClient(): SupabaseClient<Database> {
  if (!client) {
    throw new Error(
      "Supabase client not initialized. Espera un momento y recarga, o comprueba VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en Vercel.",
    );
  }
  return client;
}

export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop, receiver) {
    return Reflect.get(requireClient(), prop, receiver);
  },
});

export async function ensureGafcoreSupabaseClient(): Promise<SupabaseClient<Database>> {
  return bootClient();
}
