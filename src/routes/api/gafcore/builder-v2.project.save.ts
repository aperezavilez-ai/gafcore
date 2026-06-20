import { createFileRoute } from "@tanstack/react-router";
import { requireUser } from "@/routes/api/elevenlabs/-_auth";
import { saveBuilderProject } from "@/services/gafcoreBuilderProjects.server";

/**
 * POST /api/gafcore/builder-v2/project.save
 * Body: { projectId: string | null, name: string, html: string }
 * Si projectId es null, crea un proyecto nuevo; si no, actualiza el
 * existente (siempre verificando que sea del usuario autenticado).
 */
export const Route = createFileRoute("/api/gafcore/builder-v2/project/save")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await requireUser(request);
        if (userId instanceof Response) return userId;

        let body: { projectId?: unknown; name?: unknown; html?: unknown };
        try {
          body = await request.json();
        } catch {
          return jsonError("invalid_json", 400);
        }

        const projectId =
          typeof body.projectId === "string" && body.projectId.trim()
            ? body.projectId
            : null;
        const name =
          typeof body.name === "string" && body.name.trim()
            ? body.name.trim().slice(0, 120)
            : "Mi proyecto";
        const html = typeof body.html === "string" ? body.html : "";

        if (!html) {
          return jsonError("missing_html", 400);
        }

        try {
          const result = await saveBuilderProject(userId, { projectId, name, html });
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
