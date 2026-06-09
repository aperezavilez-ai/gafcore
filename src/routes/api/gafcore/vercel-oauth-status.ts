/**
 * GET    /api/gafcore/vercel-oauth-status → estado de conexión Vercel del usuario
 * DELETE /api/gafcore/vercel-oauth-status → desconectar Vercel
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

export const Route = createFileRoute("/api/gafcore/vercel-oauth-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userOrResponse = await requireUser(request);
        if (userOrResponse instanceof Response) return userOrResponse;
        const userId = userOrResponse;

        const { data, error } = await supabaseAdmin
          .from("user_vercel_credentials")
          .select("vercel_username, vercel_user_id, team_id, updated_at")
          .eq("user_id", userId)
          .maybeSingle();

        if (error) return json({ ok: false, connected: false }, 500);
        if (!data) return json({ ok: true, connected: false });

        const hasOAuth = Boolean(process.env.VERCEL_OAUTH_CLIENT_ID?.trim());

        return json({
          ok: true,
          connected: true,
          vercel_username: data.vercel_username,
          team_id: data.team_id,
          updated_at: data.updated_at,
          oauth_available: hasOAuth,
        });
      },

      DELETE: async ({ request }) => {
        const userOrResponse = await requireUser(request);
        if (userOrResponse instanceof Response) return userOrResponse;
        const userId = userOrResponse;

        const { error } = await supabaseAdmin
          .from("user_vercel_credentials")
          .delete()
          .eq("user_id", userId);

        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, message: "Vercel desconectado" });
      },
    },
  },
});
