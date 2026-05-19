/**
 * Vercel/runtime SSR: client.ts falls back to process.env.SUPABASE_* (not VITE_*).
 * Mirror VITE_* when only those are set in the host env panel.
 */
if (typeof process !== "undefined" && process.env) {
  if (!process.env.SUPABASE_URL?.trim() && process.env.VITE_SUPABASE_URL?.trim()) {
    process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL.trim();
  }
  if (
    !process.env.SUPABASE_PUBLISHABLE_KEY?.trim() &&
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  ) {
    process.env.SUPABASE_PUBLISHABLE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY.trim();
  }
}
