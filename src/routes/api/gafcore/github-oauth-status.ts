/**
 * GET  /api/gafcore/github-oauth-status  → devuelve si el usuario tiene GitHub conectado
 * DELETE /api/gafcore/github-oauth-status → desconecta GitHub del usuario
 */

import { createFileRoute } from "@tanstack/react-router";
import { requireUser } from "@/routes/api/elevenlabs/-_auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/gafcore/github-oauth-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userOrResponse = await requireUser(request);
        if (userOrResponse instanceof Response) return userOrResponse;
        const userId = userOrResponse;

        const { data, error } = await supabaseAdmin
          .from("user_github_credentials")
          .select("github_login, github_user_id, scopes, updated_at")
          .eq("user_id", userId)
          .maybeSingle();

        if (error) return json({ ok: false, connected: false }, 500);
        if (!data) return json({ ok: true, connected: false });

        // Verificar si el OAuth app está configurado
        const hasOAuth = Boolean(process.env.GITHUB_OAUTH_CLIENT_ID?.trim());

        return json({
          ok: true,
          connected: true,
          github_login: data.github_login,
          scopes: data.scopes,
          updated_at: data.updated_at,
          oauth_available: hasOAuth,
        });
      },

      DELETE: async ({ request }) => {
        const userOrResponse = await requireUser(request);
        if (userOrResponse instanceof Response) return userOrResponse;
        const userId = userOrResponse;

        const { error } = await supabaseAdmin
          .from("user_github_credentials")
          .delete()
          .eq("user_id", userId);

        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, message: "GitHub desconectado" });
      },
    },
  },
});
