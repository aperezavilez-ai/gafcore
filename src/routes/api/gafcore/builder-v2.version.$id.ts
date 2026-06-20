import { createFileRoute } from "@tanstack/react-router";
import { requireUser } from "@/routes/api/elevenlabs/-_auth";
import {
  getBuilderVersionHtml,
  deleteBuilderVersion,
} from "@/services/gafcoreBuilderVersions.server";

/**
 * GET    /api/gafcore/builder-v2/version/:id?projectId=...
 *        Devuelve el HTML guardado en esa versión (para restaurar).
 * DELETE /api/gafcore/builder-v2/version/:id
 *        Elimina esa versión del historial.
 */
export const Route = createFileRoute("/api/gafcore/builder-v2/version/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const userId = await requireUser(request);
        if (userId instanceof Response) return userId;

        const url = new URL(request.url);
        const projectId = url.searchParams.get("projectId") ?? "";
        if (!/^[0-9a-f-]{36}$/i.test(params.id) || !/^[0-9a-f-]{36}$/i.test(projectId)) {
          return jsonError("invalid_id", 400);
        }

        try {
          const html = await getBuilderVersionHtml(projectId, userId, params.id);
          if (html === null) return jsonError("not_found", 404);
          return new Response(JSON.stringify({ html }), {
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
          const ok = await deleteBuilderVersion(params.id, userId);
          if (!ok) return jsonError("delete_failed", 502);
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
