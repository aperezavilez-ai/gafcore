import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ensureSupabaseSsrEnv } from "@/lib/supabase-ssr-env.server";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

/**
 * Valida Bearer JWT para rutas /api/gafcore/*.
 * Usa service role + getUser (más fiable en Vercel que getClaims con anon key).
 */
export async function requireGafcoreApiUser(request: Request): Promise<string | Response> {
  ensureSupabaseSsrEnv();

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  if (!process.env.SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return new Response(JSON.stringify({ error: "server_misconfigured" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user?.id) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }
  return data.user.id;
}
