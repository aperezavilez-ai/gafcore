import { createFileRoute } from "@tanstack/react-router";
import { handleGafcoreProjectsListPost } from "@/lib/gafcore-projects-http.server";
import { requireGafcoreApiUser } from "@/lib/gafcore-api-auth.server";
import { listProjectsForUser } from "@/lib/gafcore-projects-api.server";

export const Route = createFileRoute("/api/gafcore/projects-list")({
  server: {
    handlers: {
      POST: ({ request }: { request: Request }) => handleGafcoreProjectsListPost(request),
      GET: async ({ request }: { request: Request }) => {
        const userId = await requireGafcoreApiUser(request);
        if (userId instanceof Response) return userId;

        const result = await listProjectsForUser(userId);
        if (!result.ok) {
          return json({ ok: false, error: result.error }, 503);
        }
        return json({ ok: true, projects: result.projects });
      },
    },
  },
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
