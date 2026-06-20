import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Secretos del proyecto para Builder V2.
 *
 * Reutiliza la tabla YA EXISTENTE `public.project_secrets` (la misma que
 * usa el IDE legado). Las operaciones de lectura/escritura/borrado se
 * hacen con `supabaseAdmin` (verificando `user_id` a mano, igual que el
 * resto de servicios de Builder V2). Revelar el valor en claro requiere
 * la función RPC `decrypt_project_secret`, que internamente compara con
 * `auth.uid()` — por eso esa llamada específica necesita un cliente
 * autenticado con el token real del usuario, no el cliente admin.
 */

export interface BuilderSecretSummary {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string;
}

export async function listBuilderSecrets(
  projectId: string,
  userId: string,
): Promise<BuilderSecretSummary[]> {
  const { data, error } = await supabaseAdmin
    .from("project_secrets")
    .select("id, name, description, updated_at")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`No se pudieron listar los secretos: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    updatedAt: row.updated_at,
  }));
}

export async function upsertBuilderSecret(
  projectId: string,
  userId: string,
  params: { name: string; value: string; description?: string },
): Promise<BuilderSecretSummary> {
  const cleanName = params.name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .slice(0, 80);

  if (!cleanName) {
    throw new Error("invalid_name");
  }

  const { data: encrypted, error: encryptError } = await supabaseAdmin.rpc(
    "encrypt_project_secret",
    { _value: params.value },
  );
  if (encryptError) {
    throw new Error(`No se pudo cifrar el secreto: ${encryptError.message}`);
  }

  const { data, error } = await supabaseAdmin
    .from("project_secrets")
    .upsert(
      {
        project_id: projectId,
        user_id: userId,
        name: cleanName,
        value: "",
        value_encrypted: encrypted,
        description: params.description?.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id,name" },
    )
    .select("id, name, description, updated_at")
    .single();

  if (error || !data) {
    throw new Error(`No se pudo guardar el secreto: ${error?.message ?? "sin datos"}`);
  }

  return {
    id: data.id,
    name: data.name,
    description: data.description,
    updatedAt: data.updated_at,
  };
}

export async function deleteBuilderSecret(
  secretId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("project_secrets")
    .delete()
    .eq("id", secretId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(`No se pudo eliminar el secreto: ${error.message}`);
  }
}

/**
 * Revela el valor en claro de un secreto. Usa un cliente autenticado con
 * el token real del usuario (no supabaseAdmin) porque la función RPC
 * `decrypt_project_secret` verifica `auth.uid()` del lado de Postgres.
 */
export async function revealBuilderSecret(
  secretId: string,
  accessToken: string,
): Promise<string | null> {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("server_misconfigured");
  }

  const userScopedClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data, error } = await userScopedClient.rpc("decrypt_project_secret", {
    _secret_id: secretId,
  });

  if (error) {
    throw new Error(`No se pudo descifrar el secreto: ${error.message}`);
  }

  return (data as string) ?? null;
}
