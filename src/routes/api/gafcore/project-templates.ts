import { createFileRoute } from "@tanstack/react-router";
import { requireUser } from "@/routes/api/elevenlabs/-_auth";
import { listProjectTemplatesForUser } from "@/lib/gafcore-projects-api.server";

export const Route = createFileRoute("/api/gafcore/project-templates")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const userId = await requireUser(request);
        if (userId instanceof Response) return userId;

        const result = await listProjectTemplatesForUser(userId);
        if (!result.ok) {
          return json({ ok: false, error: result.error }, 503);
        }

        return json({ ok: true, templates: result.templates });
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
