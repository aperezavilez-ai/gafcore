import { createFileRoute } from "@tanstack/react-router";
import { requireUser } from "@/routes/api/elevenlabs/-_auth";
import { listProjectsForUser } from "@/lib/gafcore-projects-api.server";
import { withGafcoreApiDiagnostics } from "@/services/health/gafcore-api-error-handler.server";

export const Route = createFileRoute("/api/gafcore/projects-list")({
  server: {
    handlers: {
      POST: withGafcoreApiDiagnostics(async (request) => {
        const userId = await requireUser(request);
        if (userId instanceof Response) return userId;

        const result = await listProjectsForUser(userId);
        if (!result.ok) {
          return json({ ok: false, error: result.error }, 503);
        }

        return json({ ok: true, projects: result.projects });
      }, { component: "gafcore.projects.list" }),
    },
  },
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
