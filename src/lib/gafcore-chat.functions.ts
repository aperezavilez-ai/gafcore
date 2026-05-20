// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  gafcoreChatBodySchema,
  buildGafcoreMessages,
  validateOutputFiles,
  cacheGet,
  cacheSet,
  fetchBalance,
  instructionKey,
  projectCacheFingerprint,
  COST_PER_REQUEST,
  type ProjFile,
} from "@/lib/gafcore-chat.shared";
import {
  completeChatMessage,
  consumeAiCredits,
  getGafcoreAiGateway,
  refundAiCredits,
  resolveGatewayModel,
} from "@/lib/gafcore-ai-gateway.server";
import { isGafcoreAdminUser } from "@/lib/gafcore-admin-role.server";
import { sanitizeUserFacingAiText } from "@/lib/gafcore-user-facing-errors";
import { enrichGafcoreOutputFiles } from "@/lib/gafcore-media.server";
import { extractVisionImageParts, patchProjectFilesVisually } from "@/lib/gafcore-media.shared";
import { loadProjectMemoryHintsForUser } from "@/lib/gafcore-ai-memory.server";
import {
  shouldBypassGafcoreChatCache,
  softenRoboticReply,
} from "@/lib/gafcore-chat-intent.shared";

export const gafcoreChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => gafcoreChatBodySchema.parse(input))
  .handler(async ({ data, context }) => {
    const t0 = Date.now();
    let gateway: ReturnType<typeof getGafcoreAiGateway>;
    try {
      gateway = getGafcoreAiGateway();
    } catch {
      throw new Error("AI no configurado");
    }

    const memoryHints = data.projectId
      ? await loadProjectMemoryHintsForUser(data.projectId, context.userId)
      : "";
    const model = resolveGatewayModel(gateway, {
      instruction: data.instruction,
      hasVision: extractVisionImageParts(data.files as ProjFile[]).length > 0,
    });
    const { messages, subset, ctxFiles } = buildGafcoreMessages(data, model, memoryHints);

    const cacheKey = `${context.userId}:${model}:${instructionKey(data.instruction)}:${projectCacheFingerprint(data.files as ProjFile[])}`;
    const cached = shouldBypassGafcoreChatCache(data.instruction) ? null : cacheGet(cacheKey);
    if (cached) {
      const bal = await fetchBalance(context.userId);
      console.info(
        JSON.stringify({
          event: "gafcore_chat",
          cacheHit: true,
          userId: context.userId,
          model,
          ms: Date.now() - t0,
          filesIn: data.files.length,
          ctxFiles: ctxFiles.length,
          subset,
          filesOut: cached.files.length,
        }),
      );
      return {
        reply: sanitizeUserFacingAiText(softenRoboticReply(data.instruction, cached.reply)),
        files: cached.files,
        balance: bal,
      };
    }

    const skipCredits = await isGafcoreAdminUser(context.userId);
    let balanceAfterConsume: number | null = null;
    if (!skipCredits) {
      const credit = await consumeAiCredits(context.userId, COST_PER_REQUEST, "gafcore_chat", {
        instruction_len: data.instruction.length,
        model,
        ctx_files: ctxFiles.length,
        subset,
      });
      if (!credit.ok) {
        if (credit.error === "insufficient_credits") {
          const err: Error & { code?: string } = new Error("INSUFFICIENT_CREDITS");
          err.code = "INSUFFICIENT_CREDITS";
          throw err;
        }
        throw new Error("No se pudo verificar tu saldo de créditos.");
      }
      balanceAfterConsume = credit.balance;
    }

    let content: string;
    try {
      const completed = await completeChatMessage({ model, messages, json: true });
      content = completed.content || "{}";
    } catch (e: unknown) {
      if (!skipCredits) {
        await refundAiCredits(context.userId, COST_PER_REQUEST, "gafcore_chat_refund", {
          error: String((e as Error)?.message ?? e),
        });
      }
      const err = e as Error & { code?: string };
      if (err.code === "provider_credits") {
        const insuff: Error & { code?: string } = new Error("INSUFFICIENT_CREDITS");
        insuff.code = "INSUFFICIENT_CREDITS";
        throw insuff;
      }
      throw e;
    }
    let parsed: { reply?: string; files?: unknown };
    try {
      parsed = JSON.parse(content);
    } catch {
      console.info(
        JSON.stringify({
          event: "gafcore_chat",
          cacheHit: false,
          userId: context.userId,
          model,
          ms: Date.now() - t0,
          filesIn: data.files.length,
          ctxFiles: ctxFiles.length,
          subset,
          filesOut: 0,
          parseError: true,
        }),
      );
      return {
        reply: sanitizeUserFacingAiText(softenRoboticReply(data.instruction, content)),
        files: [],
        balance: balanceAfterConsume,
      };
    }

    let safeFiles = validateOutputFiles(parsed.files);
    if (safeFiles.length === 0) {
      const localPatch = patchProjectFilesVisually(data.files as ProjFile[], data.instruction);
      if (localPatch.length > 0) safeFiles = localPatch;
    }
    try {
      safeFiles = await enrichGafcoreOutputFiles(
        safeFiles,
        data.files as ProjFile[],
        data.instruction,
      );
    } catch (e) {
      console.warn("enrichGafcoreOutputFiles:", e);
    }
    const reply = sanitizeUserFacingAiText(
      softenRoboticReply(
        data.instruction,
        typeof parsed.reply === "string" ? parsed.reply : "Listo.",
      ),
    );

    cacheSet(cacheKey, { reply, files: safeFiles });

    console.info(
      JSON.stringify({
        event: "gafcore_chat",
        cacheHit: false,
        userId: context.userId,
        model,
        ms: Date.now() - t0,
        filesIn: data.files.length,
        ctxFiles: ctxFiles.length,
        subset,
        filesOut: safeFiles.length,
      }),
    );

    return {
      reply,
      files: safeFiles,
      balance: balanceAfterConsume,
    };
  });
