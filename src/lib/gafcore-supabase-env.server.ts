/** Resolución Supabase en servidor (process.env), con alias anon. */

export function resolveServerSupabaseUrl(): string {
  return (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
}

export function resolveServerSupabasePublishableKey(): string {
  return (
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    ""
  );
}

export function resolveServerSupabasePublicEnv(): { url: string; publishableKey: string } | null {
  const url = resolveServerSupabaseUrl();
  const publishableKey = resolveServerSupabasePublishableKey();
  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}
