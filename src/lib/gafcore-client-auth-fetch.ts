import { supabase } from "@/integrations/supabase/client";
import { getGafcoreSupabaseBrowser } from "@/lib/gafcore-supabase-browser";

async function resolveAuthAccessToken(): Promise<string | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session?.access_token) {
    return sessionData.session.access_token;
  }
  try {
    const sb = await getGafcoreSupabaseBrowser();
    const { data } = await sb.auth.getSession();
    if (data.session?.access_token) return data.session.access_token;
    const { data: refreshed } = await sb.auth.refreshSession();
    return refreshed.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export async function gafcoreAuthJsonFetch<T = unknown>(
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await resolveAuthAccessToken();
  if (!token) {
    throw new Error("Inicia sesión para continuar.");
  }

  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : "{}",
  });

  let payload: T & { ok?: boolean; error?: string; message?: string };
  try {
    payload = (await res.json()) as T & { ok?: boolean; error?: string; message?: string };
  } catch {
    throw new Error(`Respuesta inválida del servidor (HTTP ${res.status}).`);
  }

  if (!res.ok) {
    const detail =
      payload.error ??
      payload.message ??
      (typeof payload === "object" && payload !== null && "status" in payload
        ? "El servidor no respondió correctamente. Recarga la página e inténtalo de nuevo."
        : undefined);
    throw new Error(detail ?? `Error del servidor (HTTP ${res.status}).`);
  }

  return payload;
}
