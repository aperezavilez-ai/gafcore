/**
 * Endpoint HTTP de crítica de diseño — combina heurísticas estáticas + cerebro IA.
 *
 * POST /api/gafcore/design-critique
 */
import { z } from "zod";
import { requireGafcoreApiUser } from "@/lib/gafcore-api-auth.server";
import { enforceGafcoreDesignCritiqueRateLimit } from "@/lib/gafcore-api-ratelimit.server";
import { assertGafcoreProjectAccess } from "@/lib/gafcore-project-access.server";
import { isGafcoreAdminUser } from "@/lib/gafcore-admin-role.server";
import { performDesignCritique } from "@/lib/gafcore-design-critique-run.server";
import type { ProjFileLike } from "@/lib/gafcore-design-critique.shared";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

const fileSchema = z.object({
  name: z.string().min(1).max(300),
  language: z.string().max(50).optional(),
  content: z.string().max(40000),
});

const bodySchema = z.object({
  projectId: z.string().uuid().optional(),
  files: z.array(fileSchema).min(1).max(80),
  screenshotDataUrl: z.string().max(2_500_000).optional(),
  brief: z.string().max(1500).optional(),
});

export async function handleGafcoreDesignCritiquePost(request: Request): Promise<Response> {
  const userId = await requireGafcoreApiUser(request);
  if (userId instanceof Response) return userId;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse(
      { ok: false, error: "invalid_body", detail: parsed.error.issues.slice(0, 4) },
      400,
    );
  }
  const { projectId, files, screenshotDataUrl, brief } = parsed.data;

  const skipCredits = await isGafcoreAdminUser(userId);
  if (!skipCredits) {
    const limited = await enforceGafcoreDesignCritiqueRateLimit(userId);
    if (limited) return limited;
  }

  const projectAccess = await assertGafcoreProjectAccess(projectId, userId);
  if (!projectAccess.ok) return projectAccess.response;

  const result = await performDesignCritique({
    userId,
    projectId,
    files: files as ProjFileLike[],
    brief,
    screenshotDataUrl,
    skipCredits,
  });

  if (!result.ok) {
    if (result.error === "rate_limited") return jsonResponse({ ok: false, error: "rate_limited" }, 429);
    if (result.error === "insufficient_credits")
      return jsonResponse({ ok: false, error: "insufficient_credits" }, 402);
    if (result.error === "ai_not_configured")
      return jsonResponse({ ok: false, error: "ai_not_configured" }, 500);
    return jsonResponse({ ok: false, error: result.error }, 502);
  }

  return jsonResponse({ ok: true, critique: result.critique });
}
