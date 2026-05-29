import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireUser } from "@/routes/api/elevenlabs/-_auth";
import { deleteProjectForUser } from "@/lib/gafcore-projects-api.server";

const BodySchema = z.object({
  projectId: z.string().uuid(),
  approvalId: z.string().min(1).max(128).optional(),
});

export const Route = createFileRoute("/api/gafcore/projects-delete")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
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

        const result = await deleteProjectForUser(
          userId,
          parsed.data.projectId,
          parsed.data.approvalId,
        );
        if (!result.ok) {
          return json({ ok: false, error: result.error }, 400);
        }

        return json({ ok: true });
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
