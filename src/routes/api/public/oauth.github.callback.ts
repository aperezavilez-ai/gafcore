/**
 * GET /api/public/oauth/github/callback
 *
 * GitHub OAuth callback. GitHub redirige aquí tras que el usuario autoriza.
 * Intercambia el code por un access_token y lo guarda cifrado por usuario.
 *
 * Setup en GitHub:
 *  1. github.com/settings/developers → OAuth Apps → New OAuth App
 *  2. Homepage URL: https://gafcore.com
 *  3. Callback URL: https://gafcore.com/api/public/oauth/github/callback
 *  4. Copiar Client ID y Client Secret a variables de entorno:
 *     GITHUB_OAUTH_CLIENT_ID=...
 *     GITHUB_OAUTH_CLIENT_SECRET=...
 */

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function redirect(url: string) {
  return new Response(null, { status: 302, headers: { Location: url } });
}

function errorRedirect(msg: string) {
  return redirect(`/gafcore/app?oauth_error=${encodeURIComponent(msg)}`);
}

export const Route = createFileRoute("/api/public/oauth/github/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const errorParam = url.searchParams.get("error");

        if (errorParam) {
          return errorRedirect(`GitHub rechazó la autorización: ${errorParam}`);
        }
        if (!code || !state) {
          return errorRedirect("Faltan parámetros en el callback de GitHub");
        }

        // Verificar state en DB
        const { data: stateRow, error: stateErr } = await supabaseAdmin
          .from("gafcore_oauth_states")
          .select("user_id, redirect_to, expires_at")
          .eq("state", state)
          .eq("provider", "github")
          .maybeSingle();

        if (stateErr || !stateRow) {
          return errorRedirect("Estado OAuth inválido o expirado. Intenta de nuevo.");
        }

        if (new Date(stateRow.expires_at) < new Date()) {
          return errorRedirect("El estado OAuth expiró. Vuelve a conectar GitHub.");
        }

        const userId = stateRow.user_id;

        // Borrar state usado
        await supabaseAdmin
          .from("gafcore_oauth_states")
          .delete()
          .eq("state", state);

        // Intercambiar code por access_token
        const clientId = process.env.GITHUB_OAUTH_CLIENT_ID?.trim();
        const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET?.trim();

        if (!clientId || !clientSecret) {
          return errorRedirect(
            "GitHub OAuth no configurado. Añade GITHUB_OAUTH_CLIENT_ID y GITHUB_OAUTH_CLIENT_SECRET en Vercel.",
          );
        }

        const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code,
          }),
        });

        if (!tokenRes.ok) {
          return errorRedirect(`Error al obtener token de GitHub: ${tokenRes.status}`);
        }

        const tokenData = (await tokenRes.json()) as {
          access_token?: string;
          token_type?: string;
          scope?: string;
          error?: string;
          error_description?: string;
        };

        if (tokenData.error || !tokenData.access_token) {
          return errorRedirect(
            tokenData.error_description ?? tokenData.error ?? "GitHub no devolvió un token válido",
          );
        }

        const accessToken = tokenData.access_token;
        const scopes = tokenData.scope ?? "";

        // Obtener info del usuario de GitHub
        const userRes = await fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github+json",
          },
        });

        if (!userRes.ok) {
          return errorRedirect("No se pudo obtener el perfil de GitHub");
        }

        const ghUser = (await userRes.json()) as {
          login: string;
          id: number;
        };

        if (!ghUser.login) {
          return errorRedirect("GitHub devolvió un perfil inválido");
        }

        // Cifrar y guardar token del usuario
        const { data: encrypted, error: encErr } = await supabaseAdmin.rpc(
          "encrypt_project_secret",
          { _value: accessToken },
        );

        if (encErr || !encrypted) {
          console.error("[github-oauth] encrypt error:", encErr);
          return errorRedirect("Error interno al guardar credenciales");
        }

        const { error: upsertErr } = await supabaseAdmin
          .from("user_github_credentials")
          .upsert(
            {
              user_id: userId,
              token_encrypted: encrypted as string,
              github_login: ghUser.login,
              github_user_id: ghUser.id,
              scopes,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
          );

        if (upsertErr) {
          console.error("[github-oauth] upsert error:", upsertErr);
          return errorRedirect("No se pudieron guardar las credenciales de GitHub");
        }

        console.info(
          `[github-oauth] ✓ usuario ${userId} conectó GitHub como ${ghUser.login}`,
        );

        // Redirigir de vuelta al IDE con éxito
        const redirectTo = stateRow.redirect_to ?? "/gafcore/app";
        return redirect(
          `${redirectTo}?github_connected=1&github_login=${encodeURIComponent(ghUser.login)}`,
        );
      },
    },
  },
});
