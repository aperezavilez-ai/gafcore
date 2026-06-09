/**
 * GET /api/gafcore/github-oauth-start
 *
 * Inicia el flujo OAuth de GitHub para el usuario autenticado.
 * Crea un state único en DB y redirige a github.com/login/oauth/authorize.
 *
 * El usuario NO necesita copiar ningún token — solo autoriza en GitHub
 * y vuelve automáticamente a GafCore con su cuenta conectada.
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

export const Route = createFileRoute("/api/gafcore/github-oauth-start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userOrResponse = await requireUser(request);
        if (userOrResponse instanceof Response) return userOrResponse;
        const userId = userOrResponse;

        const clientId = process.env.GITHUB_OAUTH_CLIENT_ID?.trim();
        if (!clientId) {
          return json(
            {
              ok: false,
              error: "GitHub OAuth no configurado. Añade GITHUB_OAUTH_CLIENT_ID en variables de entorno.",
            },
            503,
          );
        }

        const url = new URL(request.url);
        const redirectTo = url.searchParams.get("redirect_to") ?? "/gafcore/app";

        // Generar state único para prevenir CSRF
        const state = randomUUID().replace(/-/g, "");

        // Guardar state en DB con TTL de 10 minutos
        const { error: stateErr } = await supabaseAdmin
          .from("gafcore_oauth_states")
          .insert({
            user_id: userId,
            provider: "github",
            state,
            redirect_to: redirectTo,
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          });

        if (stateErr) {
          console.error("[github-oauth-start] state insert error:", stateErr);
          return json({ ok: false, error: "Error interno al iniciar OAuth" }, 500);
        }

        // Construir URL de autorización de GitHub
        const params = new URLSearchParams({
          client_id: clientId,
          scope: "repo,read:user",
          state,
          allow_signup: "true",
        });

        const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;

        // Redirigir directamente al navegador
        return new Response(null, {
          status: 302,
          headers: { Location: authUrl },
        });
      },
    },
  },
});
