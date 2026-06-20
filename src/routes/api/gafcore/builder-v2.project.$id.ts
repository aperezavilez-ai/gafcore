import { createFileRoute } from "@tanstack/react-router";
import { requireUser } from "@/routes/api/elevenlabs/-_auth";
import {
  loadBuilderProject,
  deleteBuilderProject,
} from "@/services/gafcoreBuilderProjects.server";

/**
 * GET    /api/gafcore/builder-v2/project/:id  -> carga proyecto + html
 * DELETE /api/gafcore/builder-v2/project/:id  -> elimina el proyecto
 */
export const Route = createFileRoute("/api/gafcore/builder-v2/project/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const userId = await requireUser(request);
        if (userId instanceof Response) return userId;

        if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
          return jsonError("invalid_id", 400);
        }

        try {
          const project = await loadBuilderProject(userId, params.id);
          if (!project) return jsonError("not_found", 404);
          return new Response(JSON.stringify(project), {
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
          await deleteBuilderProject(userId, params.id);
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
