/**
 * Endpoint HTTP de crítica de diseño — combina heurísticas estáticas + Claude (visión opcional).
 *
 * POST /api/gafcore/design-critique
 *   body: { projectId?: uuid, files: ProjFile[], screenshotDataUrl?: string, brief?: string }
 *   resp: DesignCritiqueResponse
 */
import { z } from "zod";
import { requireGafcoreApiUser } from "@/lib/gafcore-api-auth.server";
import { enforceGafcoreDesignCritiqueRateLimit } from "@/lib/gafcore-api-ratelimit.server";
import { assertGafcoreProjectAccess } from "@/lib/gafcore-project-access.server";
import { isGafcoreAdminUser } from "@/lib/gafcore-admin-role.server";
import {
  completeChatMessage,
  consumeAiCredits,
  getGafcoreAiGateway,
  refundAiCredits,
} from "@/lib/gafcore-ai-gateway.server";
import {
  buildCritiqueSystemPrompt,
  buildCritiqueUserMessage,
  designCritiqueResponseSchema,
  runStaticHeuristics,
  type DesignCritiqueResponse,
  type ProjFileLike,
} from "@/lib/gafcore-design-critique.shared";
import { readProjectBrand } from "@/lib/gafcore-brand.functions";
import { MODEL_DEEP } from "@/lib/gafcore-chat.shared";

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

const CRITIQUE_CREDIT_COST = 1;

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

  try {
    getGafcoreAiGateway();
  } catch {
    return jsonResponse({ ok: false, error: "ai_not_configured" }, 500);
  }

  if (!skipCredits) {
    const credit = await consumeAiCredits(userId, CRITIQUE_CREDIT_COST, "gafcore_design_critique", {
      files: files.length,
      hasScreenshot: !!screenshotDataUrl,
    });
    if (!credit.ok) {
      const err = credit.error === "insufficient_credits" ? "insufficient_credits" : "credits_error";
      return jsonResponse({ ok: false, error: err }, credit.error === "insufficient_credits" ? 402 : 500);
    }
  }

  const staticIssues = runStaticHeuristics(files as ProjFileLike[]);
  const brand = projectId ? await readProjectBrand(projectId) : null;

  const userText = buildCritiqueUserMessage({
    files: files as ProjFileLike[],
    brandName: brand?.name,
    staticIssues,
    brief,
  });

  const userContent: unknown =
    screenshotDataUrl && screenshotDataUrl.startsWith("data:image/")
      ? [
          { type: "text", text: userText },
          { type: "image_url", image_url: { url: screenshotDataUrl } },
        ]
      : userText;

  const messages = [
    { role: "system" as const, content: buildCritiqueSystemPrompt() },
    { role: "user" as const, content: userContent as string },
  ];

  let raw2: { content: string } | null = null;
  try {
    raw2 = await completeChatMessage({
      model: MODEL_DEEP,
      messages: messages as Array<{ role: string; content: unknown }> as Array<{
        role: "system" | "user" | "assistant";
        content: string;
      }>,
      temperature: 0.4,
      json: true,
    });
  } catch (e: unknown) {
    if (!skipCredits) {
      await refundAiCredits(userId, CRITIQUE_CREDIT_COST, "gafcore_design_critique_refund", {
        error: String((e as Error)?.message ?? e),
      });
    }
    const err = e as Error & { code?: string };
    if (err.code === "rate_limited") return jsonResponse({ ok: false, error: "rate_limited" }, 429);
    if (err.code === "provider_credits")
      return jsonResponse({ ok: false, error: "insufficient_credits" }, 402);
    return jsonResponse({ ok: false, error: "upstream", detail: err.message }, 502);
  }

  let critique: DesignCritiqueResponse;
  try {
    const obj = JSON.parse(raw2?.content ?? "{}");
    const validated = designCritiqueResponseSchema.safeParse(obj);
    if (!validated.success) throw new Error("schema");
    critique = validated.data;
  } catch {
    critique = {
      summary:
        staticIssues.length > 0
          ? "Análisis estático completado. Modelo no devolvió JSON válido — se usan heurísticas locales."
          : "El cerebro no encontró problemas reseñables.",
      score: staticIssues.length === 0 ? 90 : Math.max(40, 90 - staticIssues.length * 6),
      issues: staticIssues.slice(0, 10),
      followupInstruction:
        staticIssues.length === 0
          ? "[modo profundo] Refina detalles visuales: jerarquía, espaciado consistente y estados hover/focus en todos los interactivos."
          : `[modo profundo] Aplica estas mejoras de diseño:\n${staticIssues
              .slice(0, 8)
              .map((i, idx) => `${idx + 1}. ${i.title} → ${i.suggestion}`)
              .join("\n")}`,
    };
  }

  return jsonResponse({ ok: true, critique });
}
