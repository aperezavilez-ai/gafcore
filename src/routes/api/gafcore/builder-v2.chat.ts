import { createFileRoute } from "@tanstack/react-router";
import { requireUser } from "@/routes/api/elevenlabs/-_auth";
import { chatAboutSite } from "@/services/siteBuilderV2.server";

/**
 * POST /api/gafcore/builder-v2/chat
 * Body: { message: string, currentHtml?: string }
 * Conversación libre sobre el sitio (modo "Chatear"). No modifica el HTML.
 */
export const Route = createFileRoute("/api/gafcore/builder-v2/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await requireUser(request);
        if (userId instanceof Response) return userId;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return jsonError("invalid_json", 400);
        }

        const message =
          typeof (body as Record<string, unknown>)?.message === "string"
            ? ((body as Record<string, unknown>).message as string).trim()
            : "";
        const currentHtml =
          typeof (body as Record<string, unknown>)?.currentHtml === "string"
            ? ((body as Record<string, unknown>).currentHtml as string)
            : undefined;

        if (!message) {
          return jsonError("missing_message", 400);
        }

        try {
          const result = await chatAboutSite(message, currentHtml);
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          const errMessage = err instanceof Error ? err.message : "unknown_error";
          return jsonError(errMessage, 502);
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
