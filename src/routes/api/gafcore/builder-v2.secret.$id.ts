import { createFileRoute } from "@tanstack/react-router";
import { requireUser } from "@/routes/api/elevenlabs/-_auth";
import {
  deleteBuilderSecret,
  revealBuilderSecret,
} from "@/services/gafcoreBuilderSecrets.server";

/**
 * GET    /api/gafcore/builder-v2/secret/:id
 *        Devuelve el valor en claro de un secreto (requiere el token del
 *        usuario porque la verificación de propiedad es vía auth.uid()).
 * DELETE /api/gafcore/builder-v2/secret/:id
 *        Elimina ese secreto.
 */
export const Route = createFileRoute("/api/gafcore/builder-v2/secret/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const userId = await requireUser(request);
        if (userId instanceof Response) return userId;

        if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
          return jsonError("invalid_id", 400);
        }

        const authHeader = request.headers.get("authorization") ?? "";
        const accessToken = authHeader.startsWith("Bearer ")
          ? authHeader.slice("Bearer ".length).trim()
          : "";
        if (!accessToken) {
          return jsonError("unauthorized", 401);
        }

        try {
          const value = await revealBuilderSecret(params.id, accessToken);
          if (value === null) return jsonError("not_found", 404);
          return new Response(JSON.stringify({ value }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "unknown_error";
          return jsonError(message, 502);
        }
      },

      DELETE: async ({ request, params }) => {
        const userId = await requireUser(request);
        if (userId instanceof Response) return userId;

        if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
          return jsonError("invalid_id", 400);
        }

        try {
          await deleteBuilderSecret(params.id, userId);
          return new Response(JSON.stringify({ deleted: true }), {
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
