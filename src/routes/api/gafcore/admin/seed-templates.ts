import { createFileRoute } from "@tanstack/react-router";
import { requireUser } from "@/routes/api/elevenlabs/-_auth";
import { isGafcoreAdminUser } from "@/lib/gafcore-admin-role.server";
import { ensureBuiltinTemplatesSeeded, listActiveTemplates } from "@/lib/gafcore-templates.server";

/**
 * POST /api/gafcore/admin/seed-templates
 * Inserta plantillas built-in si la tabla está vacía (solo admin).
 */
export const Route = createFileRoute("/api/gafcore/admin/seed-templates")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const userId = await requireUser(request);
        if (userId instanceof Response) return userId;

        if (!(await isGafcoreAdminUser(userId))) {
          return json({ error: "forbidden" }, 403);
        }

        await ensureBuiltinTemplatesSeeded();
        const templates = await listActiveTemplates();

        return json({ ok: true, count: templates.length, templates });
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
