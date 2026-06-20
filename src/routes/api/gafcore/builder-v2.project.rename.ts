import { createFileRoute } from "@tanstack/react-router";
import { requireUser } from "@/routes/api/elevenlabs/-_auth";
import { renameBuilderProject } from "@/services/gafcoreBuilderProjects.server";

/**
 * POST /api/gafcore/builder-v2/project.rename
 * Body: { projectId: string, name: string }
 * Renombra un proyecto sin tocar su HTML (usado desde la pantalla
 * "Mis proyectos").
 */
export const Route = createFileRoute("/api/gafcore/builder-v2/project/rename")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await requireUser(request);
        if (userId instanceof Response) return userId;

        let body: { projectId?: unknown; name?: unknown };
        try {
          body = await request.json();
        } catch {
          return jsonError("invalid_json", 400);
        }

        const projectId = typeof body.projectId === "string" ? body.projectId : "";
        const name =
          typeof body.name === "string" && body.name.trim()
            ? body.name.trim().slice(0, 120)
            : "";

        if (!projectId || !/^[0-9a-f-]{36}$/i.test(projectId)) {
          return jsonError("invalid_id", 400);
        }
        if (!name) {
          return jsonError("missing_name", 400);
        }

        try {
          const result = await renameBuilderProject(userId, { projectId, name });
          return new Response(JSON.stringify(result), {
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
