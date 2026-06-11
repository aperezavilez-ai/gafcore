import { createFileRoute } from "@tanstack/react-router";
import { requireUser } from "@/routes/api/elevenlabs/-_auth";
import { withGafcoreApiDiagnostics } from "@/services/health/gafcore-api-error-handler.server";
import { CreateProjectInputSchema } from "@/lib/projects/project-create.shared";
import { executeCreateProject } from "@/lib/projects/project-create.service.server";

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

        const parsed = CreateProjectInputSchema.safeParse(body);
        if (!parsed.success) {
          return json({ ok: false, error: "invalid_body" }, 400);
        }

        const result = await executeCreateProject(userId, parsed.data);
        if (!result.ok) {
          return json(
            { ok: false, error: result.error, code: result.code, requestId: result.requestId },
            result.code === "SERVER_MISCONFIGURED" ? 503 : 400,
          );
        }

        return json({
          ok: true,
          project: result.project,
          files: result.files,
          requestId: result.requestId,
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
