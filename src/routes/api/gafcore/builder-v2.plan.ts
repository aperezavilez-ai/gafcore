import { createFileRoute } from "@tanstack/react-router";
import { requireUser } from "@/routes/api/elevenlabs/-_auth";
import { planSiteStructure } from "@/services/siteBuilderV2.server";

/**
 * POST /api/gafcore/builder-v2/plan
 * Body: { prompt: string } -> propone la lista de secciones (wireframe)
 * para el sitio, antes de generar el HTML final. No genera código todavía.
 */
export const Route = createFileRoute("/api/gafcore/builder-v2/plan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (auth instanceof Response) return auth;

        let body: { prompt?: unknown };
        try {
          body = await request.json();
        } catch {
          return jsonError("invalid_json", 400);
        }

        const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
        if (!prompt) {
          return jsonError("missing_prompt", 400);
        }
        if (prompt.length > 4000) {
          return jsonError("prompt_too_long", 400);
        }

        try {
          const result = await planSiteStructure(prompt);
          return new Response(JSON.stringify(result), {
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
