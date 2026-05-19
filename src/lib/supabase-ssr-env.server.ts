/**
 * Vercel/runtime SSR: client.ts falls back to process.env.SUPABASE_* (not VITE_*).
 * Must be invoked from server fetch (not side-effect import — tree-shaken with sideEffects: false).
 */
export function ensureSupabaseSsrEnv(): void {
  if (typeof process === "undefined" || !process.env) return;

  if (!process.env.SUPABASE_URL?.trim() && process.env.VITE_SUPABASE_URL?.trim()) {
    process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL.trim();
  }
  if (
    !process.env.SUPABASE_PUBLISHABLE_KEY?.trim() &&
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  ) {
    process.env.SUPABASE_PUBLISHABLE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY.trim();
  }
  if (!process.env.VITE_SUPABASE_URL?.trim() && process.env.SUPABASE_URL?.trim()) {
    process.env.VITE_SUPABASE_URL = process.env.SUPABASE_URL.trim();
  }
  if (
    !process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() &&
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim()
  ) {
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY.trim();
  }
}
