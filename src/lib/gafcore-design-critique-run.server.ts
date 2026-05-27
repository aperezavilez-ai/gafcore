/**
 * Ejecución interna de crítica de diseño (HTTP + fábrica).
 */
import { isGafcoreAdminUser } from "@/lib/gafcore-admin-role.server";
import {
  completeChatMessage,
  consumeAiCredits,
  getGafcoreAiGateway,
  refundAiCredits,
} from "@/lib/gafcore-ai-gateway.server";
import { readProjectBrand } from "@/lib/gafcore-brand.functions";
import { MODEL_DEEP } from "@/lib/gafcore-chat.shared";
import {
  buildCritiqueSystemPrompt,
  buildCritiqueUserMessage,
  designCritiqueResponseSchema,
  runStaticHeuristics,
  type DesignCritiqueResponse,
  type ProjFileLike,
} from "@/lib/gafcore-design-critique.shared";

export type CritiqueRunInput = {
  userId: string;
  projectId?: string;
  files: ProjFileLike[];
  brief?: string;
  screenshotDataUrl?: string;
  skipCredits?: boolean;
};

export async function performDesignCritique(
  input: CritiqueRunInput,
): Promise<{ ok: true; critique: DesignCritiqueResponse } | { ok: false; error: string }> {
  const skipCredits = input.skipCredits ?? (await isGafcoreAdminUser(input.userId));

  try {
    getGafcoreAiGateway();
  } catch {
    return { ok: false, error: "ai_not_configured" };
  }

  if (!skipCredits) {
    const credit = await consumeAiCredits(input.userId, 1, "gafcore_design_critique", {
      files: input.files.length,
    });
    if (!credit.ok) {
      return {
        ok: false,
        error: credit.error === "insufficient_credits" ? "insufficient_credits" : "credits_error",
      };
    }
  }

  const staticIssues = runStaticHeuristics(input.files);
  const brand = input.projectId ? await readProjectBrand(input.projectId) : null;

  const userText = buildCritiqueUserMessage({
    files: input.files,
    brandName: brand?.name,
    staticIssues,
    brief: input.brief,
  });

  const userContent: unknown =
    input.screenshotDataUrl && input.screenshotDataUrl.startsWith("data:image/")
      ? [
          { type: "text", text: userText },
          { type: "image_url", image_url: { url: input.screenshotDataUrl } },
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
      messages: messages as Array<{ role: "system" | "user" | "assistant"; content: string }>,
      temperature: 0.4,
      json: true,
    });
  } catch (e: unknown) {
    if (!skipCredits) {
      await refundAiCredits(input.userId, 1, "gafcore_design_critique_refund", {
        error: String((e as Error)?.message ?? e),
      });
    }
    const err = e as Error & { code?: string };
    if (err.code === "rate_limited") return { ok: false, error: "rate_limited" };
    if (err.code === "provider_credits") return { ok: false, error: "insufficient_credits" };
    return { ok: false, error: "upstream" };
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
          ? "Análisis estático completado."
          : "Sin problemas reseñables.",
      score: staticIssues.length === 0 ? 90 : Math.max(40, 90 - staticIssues.length * 6),
      issues: staticIssues.slice(0, 10),
      followupInstruction:
        staticIssues.length === 0
          ? "[modo profundo] Refina detalles visuales: jerarquía, espaciado y estados hover/focus."
          : `[modo profundo] Aplica estas mejoras de diseño:\n${staticIssues
              .slice(0, 8)
              .map((i, idx) => `${idx + 1}. ${i.title} → ${i.suggestion}`)
              .join("\n")}`,
    };
  }

  return { ok: true, critique };
}
