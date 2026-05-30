import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireUser } from "@/routes/api/elevenlabs/-_auth";
import { createProjectForUser } from "@/lib/gafcore-projects-api.server";
import { withGafcoreApiDiagnostics } from "@/services/health/gafcore-api-error-handler.server";

const BodySchema = z.object({
  name: z.string().min(1).max(200),
  templateSlug: z.string().min(1).max(80).optional(),
});

export const Route = createFileRoute("/api/gafcore/projects-create")({
  server: {
    handlers: {
      POST: withGafcoreApiDiagnostics(async (request) => {
        const userId = await requireUser(request);
        if (userId instanceof Response) return userId;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ ok: false, error: "invalid_json" }, 400);
        }

        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) {
          return json({ ok: false, error: "invalid_body" }, 400);
        }

        const result = await createProjectForUser(userId, parsed.data.name, {
          templateSlug: parsed.data.templateSlug,
        });
        if (!result.ok) {
          return json({ ok: false, error: result.error }, 400);
        }

        return json({
          ok: true,
          project: result.project,
          files: result.files,
        });
      }, { component: "gafcore.projects.create" }),
    },
  },
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
