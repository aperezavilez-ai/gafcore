/**
 * Comprueba que un projectId pertenece al usuario autenticado antes de leer marca/memoria con service role.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

export type GafcoreProjectAccessResult =
  | { ok: true }
  | { ok: false; response: Response };

/** Sin projectId no hay comprobación (chat sin proyecto abierto). */
export async function assertGafcoreProjectAccess(
  projectId: string | null | undefined,
  userId: string,
): Promise<GafcoreProjectAccessResult> {
  if (!projectId) return { ok: true };

  const { data: proj, error } = await supabaseAdmin
    .from("projects")
    .select("id, user_id")
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    console.warn("[gafcore-project-access] db error:", error.message);
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "project_access_error" }), {
        status: 500,
        headers: JSON_HEADERS,
      }),
    };
  }

  if (!proj?.id || (proj.user_id && proj.user_id !== userId)) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "project_not_found" }), {
        status: 404,
        headers: JSON_HEADERS,
      }),
    };
  }

  return { ok: true };
}
