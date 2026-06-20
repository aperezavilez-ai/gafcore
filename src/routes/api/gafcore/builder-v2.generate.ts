import { createFileRoute } from "@tanstack/react-router";
import { requireUser } from "@/routes/api/elevenlabs/-_auth";
import {
  generateSiteHtml,
  editSiteHtml,
  type SitePlanSection,
} from "@/services/siteBuilderV2.server";

/**
 * POST /api/gafcore/builder-v2/generate
 * Body: { prompt: string } -> genera un sitio nuevo desde cero.
 * Body: { prompt: string, approvedPlan: SitePlanSection[] } -> genera el
 *   sitio respetando la estructura ya aprobada por el usuario (wireframe).
 * Body: { prompt: string, currentHtml: string } -> edita el sitio existente.
 */
export const Route = createFileRoute("/api/gafcore/builder-v2/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (auth instanceof Response) return auth;
        let body: {
          prompt?: unknown;
          currentHtml?: unknown;
          approvedPlan?: unknown;
        };
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
        const currentHtml =
          typeof body.currentHtml === "string" && body.currentHtml.trim()
            ? body.currentHtml
            : null;
        const approvedPlan = parseApprovedPlan(body.approvedPlan);
        try {
          const result = currentHtml
            ? await editSiteHtml(currentHtml, prompt)
            : await generateSiteHtml(prompt, approvedPlan ?? undefined);
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

function parseApprovedPlan(raw: unknown): SitePlanSection[] | null {
  if (!Array.isArray(raw)) return null;
  const sections = raw
    .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
    .map((s) => ({
      id: String(s.id ?? "").trim(),
      label: String(s.label ?? "").trim(),
      description: String(s.description ?? "").trim(),
    }))
    .filter((s) => s.id && s.label);
  return sections.length > 0 ? sections : null;
}

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
