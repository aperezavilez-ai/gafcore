/**
 * GET /api/public/oauth/vercel/callback
 *
 * Vercel OAuth callback. Vercel redirige aquí tras autorización.
 * Intercambia code por access_token y lo guarda cifrado por usuario.
 */

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function redirect(url: string) {
  return new Response(null, { status: 302, headers: { Location: url } });
}

function errorRedirect(msg: string) {
  return redirect(`/gafcore/app?oauth_error=${encodeURIComponent(msg)}`);
}

export const Route = createFileRoute("/api/public/oauth/vercel/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const errorParam = url.searchParams.get("error");

        if (errorParam) {
          return errorRedirect(`Vercel rechazó la autorización: ${errorParam}`);
        }
        if (!code || !state) {
          return errorRedirect("Faltan parámetros en el callback de Vercel");
        }

        // Verificar state en DB
        const { data: stateRow, error: stateErr } = await supabaseAdmin
          .from("gafcore_oauth_states")
          .select("user_id, redirect_to, expires_at")
          .eq("state", state)
          .eq("provider", "vercel")
          .maybeSingle();

        if (stateErr || !stateRow) {
          return errorRedirect("Estado OAuth inválido o expirado. Intenta de nuevo.");
        }

        if (new Date(stateRow.expires_at) < new Date()) {
          return errorRedirect("El estado OAuth expiró. Vuelve a conectar Vercel.");
        }

        const userId = stateRow.user_id;

        await supabaseAdmin
          .from("gafcore_oauth_states")
          .delete()
          .eq("state", state);

        const clientId = process.env.VERCEL_OAUTH_CLIENT_ID?.trim();
        const clientSecret = process.env.VERCEL_OAUTH_CLIENT_SECRET?.trim();

        if (!clientId || !clientSecret) {
          return errorRedirect(
            "Vercel OAuth no configurado. Añade VERCEL_OAUTH_CLIENT_ID y VERCEL_OAUTH_CLIENT_SECRET.",
          );
        }

        // Intercambiar code por access_token
        const tokenRes = await fetch("https://api.vercel.com/v2/oauth/access_token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            redirect_uri: "https://gafcore.com/api/public/oauth/vercel/callback",
          }).toString(),
        });

        if (!tokenRes.ok) {
          const txt = await tokenRes.text().catch(() => "");
          return errorRedirect(`Error al obtener token de Vercel: ${tokenRes.status} ${txt.slice(0, 100)}`);
        }

        const tokenData = (await tokenRes.json()) as {
          access_token?: string;
          token_type?: string;
          team_id?: string | null;
          user_id?: string;
          error?: string;
          error_description?: string;
        };

        if (tokenData.error || !tokenData.access_token) {
          return errorRedirect(
            tokenData.error_description ?? tokenData.error ?? "Vercel no devolvió un token válido",
          );
        }

        const accessToken = tokenData.access_token;
        const teamId = tokenData.team_id ?? null;

        // Obtener info del usuario de Vercel
        const userRes = await fetch("https://api.vercel.com/v2/user", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        let vercelUsername = "usuario";
        let vercelUserId = tokenData.user_id ?? "";

        if (userRes.ok) {
          const userData = (await userRes.json()) as {
            user?: { username?: string; id?: string };
          };
          vercelUsername = userData.user?.username ?? vercelUsername;
          vercelUserId = userData.user?.id ?? vercelUserId;
        }

        // Cifrar y guardar token
        const { data: encrypted, error: encErr } = await supabaseAdmin.rpc(
          "encrypt_project_secret",
          { _value: accessToken },
        );

        if (encErr || !encrypted) {
          return errorRedirect("Error interno al guardar credenciales de Vercel");
        }

        const { error: upsertErr } = await supabaseAdmin
          .from("user_vercel_credentials")
          .upsert(
            {
              user_id: userId,
              token_encrypted: encrypted as string,
              vercel_user_id: vercelUserId,
              vercel_username: vercelUsername,
              team_id: teamId,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
          );

        if (upsertErr) {
          return errorRedirect("No se pudieron guardar las credenciales de Vercel");
        }

        console.info(
          `[vercel-oauth] ✓ usuario ${userId} conectó Vercel como ${vercelUsername}`,
        );

        const redirectTo = stateRow.redirect_to ?? "/gafcore/app";
        return redirect(
          `${redirectTo}?vercel_connected=1&vercel_username=${encodeURIComponent(vercelUsername)}`,
        );
      },
    },
  },
});
