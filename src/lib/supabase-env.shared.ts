/** Comprueba que el build del cliente incluyó credenciales Supabase (sin tocar el proxy). */
export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  return Boolean(url && key);
}
