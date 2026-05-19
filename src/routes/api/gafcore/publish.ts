import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireUser } from "@/routes/api/elevenlabs/-_auth";
import { publishProjectOnServer } from "@/lib/github-publish.server";
import type { FileItem } from "@/components/ide/CodeEditor";

const FileSchema = z.object({
  name: z.string(),
  language: z.string(),
  content: z.string(),
});

const BodySchema = z.object({
  projectId: z.string().uuid(),
  projectName: z.string().min(1).max(200),
  files: z.array(FileSchema).optional(),
});

/**
 * POST /api/gafcore/publish
 * Publica desde el servidor: lee archivos en Supabase y sube a GitHub.
 */
export const Route = createFileRoute("/api/gafcore/publish")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const userId = await requireUser(request);
        if (userId instanceof Response) return userId;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return json({ error: "invalid_json" }, 400);
        }

        const parsed = BodySchema.safeParse(body);
        if (!parsed.success) {
          return json({ error: "invalid_body" }, 400);
        }

        const result = await publishProjectOnServer({
          userId,
          projectId: parsed.data.projectId,
          projectName: parsed.data.projectName,
          files: parsed.data.files as FileItem[] | undefined,
        });

        return json(result, result.ok ? 200 : 400);
      },
    },
  },
});

function json(data: unknown, status: number) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
