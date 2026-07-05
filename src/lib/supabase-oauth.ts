import { supabase } from "@/lib/gafcore-supabase-client-proxy";

export type OAuthProvider = "google" | "apple";

/**
 * OAuth con proveedores configurados en el proyecto Supabase (Google / Apple).
 * Tras el redirect, Supabase restaura la sesión en `redirectTo`.
 */
export async function signInWithOAuth(
  provider: OAuthProvider,
  redirectPath: string,
): Promise<{ error?: string }> {
  const path = redirectPath.startsWith("/") ? redirectPath : `/${redirectPath}`;
  const redirectTo = `${window.location.origin}${path}`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo },
  });

  if (error) return { error: error.message };
  if (data?.url) {
    window.location.href = data.url;
    return {};
  }
  return { error: "No se pudo obtener la URL de inicio de sesión del proveedor." };
}
