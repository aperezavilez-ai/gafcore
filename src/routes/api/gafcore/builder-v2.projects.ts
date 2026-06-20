import { createFileRoute } from "@tanstack/react-router";
import { requireUser } from "@/routes/api/elevenlabs/-_auth";
import { listBuilderProjects } from "@/services/gafcoreBuilderProjects.server";

/**
 * GET /api/gafcore/builder-v2/projects
 * Lista los proyectos del Builder V2 del usuario autenticado, mas
 * recientes primero.
 */
export const Route = createFileRoute("/api/gafcore/builder-v2/projects")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const userId = await requireUser(request);
        if (userId instanceof Response) return userId;

        try {
          const projects = await listBuilderProjects(userId);
          return new Response(JSON.stringify({ projects }), {
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
