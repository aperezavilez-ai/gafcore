import { createFileRoute } from "@tanstack/react-router";
import { requireUser } from "@/routes/api/elevenlabs/-_auth";
import {
  listBuilderSecrets,
  upsertBuilderSecret,
} from "@/services/gafcoreBuilderSecrets.server";

/**
 * GET  /api/gafcore/builder-v2/secrets?projectId=...
 *      Lista los secretos del proyecto (sin el valor en claro).
 * POST /api/gafcore/builder-v2/secrets
 *      Body: { projectId: string, name: string, value: string, description?: string }
 *      Crea o actualiza (por nombre) un secreto del proyecto.
 */
export const Route = createFileRoute("/api/gafcore/builder-v2/secrets")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userId = await requireUser(request);
        if (userId instanceof Response) return userId;

        const url = new URL(request.url);
        const projectId = url.searchParams.get("projectId") ?? "";
        if (!/^[0-9a-f-]{36}$/i.test(projectId)) {
          return jsonError("invalid_project_id", 400);
        }

        try {
          const secrets = await listBuilderSecrets(projectId, userId);
          return new Response(JSON.stringify({ secrets }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "unknown_error";
          return jsonError(message, 502);
        }
      },

      POST: async ({ request }) => {
        const userId = await requireUser(request);
        if (userId instanceof Response) return userId;

        let body: {
          projectId?: unknown;
          name?: unknown;
          value?: unknown;
          description?: unknown;
        };
        try {
          body = await request.json();
        } catch {
          return jsonError("invalid_json", 400);
        }

        const projectId = typeof body.projectId === "string" ? body.projectId : "";
        const name = typeof body.name === "string" ? body.name : "";
        const value = typeof body.value === "string" ? body.value : "";
        const description =
          typeof body.description === "string" ? body.description : undefined;

        if (!/^[0-9a-f-]{36}$/i.test(projectId)) {
          return jsonError("invalid_project_id", 400);
        }
        if (!name.trim() || !value.trim()) {
          return jsonError("missing_name_or_value", 400);
        }

        try {
          const secret = await upsertBuilderSecret(projectId, userId, {
            name,
            value,
            description,
          });
          return new Response(JSON.stringify(secret), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "unknown_error";
          return jsonError(message, 502);
        }
      },
    },
  },
});

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
