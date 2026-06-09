/**
 * GET /api/gafcore/vercel-oauth-start
 *
 * Inicia el flujo OAuth de Vercel para el usuario autenticado.
 * Redirige a vercel.com/oauth/authorize con state único.
 *
 * Setup en Vercel:
 *  1. vercel.com/account/applications → Create
 *  2. Redirect URL: https://gafcore.com/api/public/oauth/vercel/callback
 *  3. Copiar Client ID y Client Secret a variables de entorno:
 *     VERCEL_OAUTH_CLIENT_ID=...
 *     VERCEL_OAUTH_CLIENT_SECRET=...
 */

import { createFileRoute } from "@tanstack/react-router";
import { requireUser } from "@/routes/api/elevenlabs/-_auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { randomUUID } from "crypto";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/gafcore/vercel-oauth-start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userOrResponse = await requireUser(request);
        if (userOrResponse instanceof Response) return userOrResponse;
        const userId = userOrResponse;

        const clientId = process.env.VERCEL_OAUTH_CLIENT_ID?.trim();
        if (!clientId) {
          return json(
            {
              ok: false,
              error:
                "Vercel OAuth no configurado. Añade VERCEL_OAUTH_CLIENT_ID en variables de entorno.",
            },
            503,
          );
        }

        const url = new URL(request.url);
        const redirectTo = url.searchParams.get("redirect_to") ?? "/gafcore/app";

        const state = randomUUID().replace(/-/g, "");

        const { error: stateErr } = await supabaseAdmin
          .from("gafcore_oauth_states")
          .insert({
            user_id: userId,
            provider: "vercel",
            state,
            redirect_to: redirectTo,
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          });

        if (stateErr) {
          console.error("[vercel-oauth-start] state insert:", stateErr);
          return json({ ok: false, error: "Error interno al iniciar OAuth" }, 500);
        }

        const params = new URLSearchParams({
          client_id: clientId,
          state,
        });

        const authUrl = `https://vercel.com/oauth/authorize?${params.toString()}`;

        return new Response(null, {
          status: 302,
          headers: { Location: authUrl },
        });
      },
    },
  },
});
