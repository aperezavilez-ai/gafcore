/**
 * Resolución de URL y clave pública Supabase (Vite + alias anon).
 * La clave «anon» del panel Supabase = VITE_SUPABASE_PUBLISHABLE_KEY o VITE_SUPABASE_ANON_KEY.
 */

type EnvBag = Record<string, string | undefined>;

function pickFirst(bag: EnvBag, keys: readonly string[]): string {
  for (const key of keys) {
    const v = bag[key]?.trim();
    if (v) return v;
  }
  return "";
}

const VITE_URL_KEYS = ["VITE_SUPABASE_URL"] as const;

/** Clave pública del proyecto (anon / publishable). */
export const VITE_SUPABASE_KEY_NAMES = [
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_ANON_KEY",
] as const;

export function resolveSupabaseUrlFromViteEnv(): string {
  return pickFirst(import.meta.env as EnvBag, VITE_URL_KEYS);
}

export function resolveSupabasePublishableKeyFromViteEnv(): string {
  return pickFirst(import.meta.env as EnvBag, VITE_SUPABASE_KEY_NAMES);
}

export function isViteSupabaseConfigured(): boolean {
  return Boolean(resolveSupabaseUrlFromViteEnv() && resolveSupabasePublishableKeyFromViteEnv());
}

/** Mensaje para UI / errores (sin secretos). */
export const GAFCORE_SUPABASE_ENV_HINT =
  "Define VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY (o VITE_SUPABASE_ANON_KEY con la clave anon del panel Supabase) en Vercel → Environment Variables, en Production y Build, y redeploy.";
