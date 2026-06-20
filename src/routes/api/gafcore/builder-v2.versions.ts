import { createFileRoute } from "@tanstack/react-router";
import { requireUser } from "@/routes/api/elevenlabs/-_auth";
import {
  listBuilderVersions,
  saveBuilderVersion,
} from "@/services/gafcoreBuilderVersions.server";

/**
 * GET  /api/gafcore/builder-v2/versions?projectId=...
 *      Lista el historial de versiones de un proyecto (más reciente primero).
 * POST /api/gafcore/builder-v2/versions
 *      Body: { projectId: string, html: string, label?: string }
 *      Guarda una versión manual del HTML actual.
 */
export const Route = createFileRoute("/api/gafcore/builder-v2/versions")({
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
          const versions = await listBuilderVersions(projectId, userId);
          return new Response(JSON.stringify({ versions }), {
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

        let body: { projectId?: unknown; html?: unknown; label?: unknown };
        try {
          body = await request.json();
        } catch {
          return jsonError("invalid_json", 400);
        }

        const projectId = typeof body.projectId === "string" ? body.projectId : "";
        const html = typeof body.html === "string" ? body.html : "";
        const label = typeof body.label === "string" ? body.label : "Versión manual";

        if (!/^[0-9a-f-]{36}$/i.test(projectId)) {
          return jsonError("invalid_project_id", 400);
        }
        if (!html) {
          return jsonError("missing_html", 400);
        }

        try {
          const version = await saveBuilderVersion(projectId, userId, html, label, false);
          if (!version) return jsonError("save_failed", 502);
          return new Response(JSON.stringify(version), {
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
