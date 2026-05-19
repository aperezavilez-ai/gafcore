import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireUser } from "@/routes/api/elevenlabs/-_auth";
import { getGithubUser } from "@/lib/github-api.shared";
import { saveGithubTokenForUser } from "@/lib/github-publish.server";

const BodySchema = z.object({
  token: z.string().min(10).max(512),
});

/**
 * POST /api/gafcore/github-connect
 * Guarda el PAT de GitHub cifrado en el servidor (no solo localStorage).
 */
export const Route = createFileRoute("/api/gafcore/github-connect")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const userId = await requireUser(request);
        if (userId instanceof Response) return userId;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid_json" }, 400);
        }

        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) {
          return json({ error: "invalid_body" }, 400);
        }

        const ghUser = await getGithubUser(parsed.data.token);
        if (!ghUser) {
          return json({ error: "invalid_token", message: "Token de GitHub inválido o sin scope repo." }, 401);
        }

        const ok = await saveGithubTokenForUser(userId, parsed.data.token, ghUser.login);
        if (!ok) {
          return json({ error: "save_failed", message: "No se pudo guardar el token." }, 500);
        }

        return json({ ok: true, github_login: ghUser.login }, 200);
      },
    },
  },
});

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
