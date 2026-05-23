import { supabase } from "@/integrations/supabase/client";

export async function gafcoreAuthJsonFetch<T = unknown>(
  path: string,
  body?: unknown,
): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
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
    throw new Error(
      payload.error ?? payload.message ?? `Error del servidor (HTTP ${res.status}).`,
    );
  }

  return payload;
}
