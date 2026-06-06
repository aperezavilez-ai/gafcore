// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  gafcoreChatBodySchema,
  buildGafcoreMessages,
  cacheGet,
  cacheSet,
  buildGafcoreChatCacheKey,
  shouldWriteGafcoreChatCache,
  fetchBalance,
  COST_PER_REQUEST,
  type ProjFile,
} from "@/lib/gafcore-chat.shared";
import {
  consumeAiCredits,
  getGafcoreAiGateway,
  refundAiCredits,
  resolveGatewayModel,
} from "@/lib/gafcore-ai-gateway.server";
import { isGafcoreAdminUser } from "@/lib/gafcore-admin-role.server";
import { enforceGafcoreChatRateLimit } from "@/lib/gafcore-api-ratelimit.server";
import { assertGafcoreProjectAccess } from "@/lib/gafcore-project-access.server";
import { sanitizeUserFacingAiText } from "@/lib/gafcore-user-facing-errors";
import { enrichGafcoreOutputFiles } from "@/lib/gafcore-media.server";
import { extractVisionImageParts } from "@/lib/gafcore-media.shared";
import { retrieveProjectMemoryContext } from "@/memory/retrieve.server";
import { shouldBypassGafcoreChatCache, softenRoboticReply } from "@/lib/gafcore-chat-intent.shared";
import {
  getPersistedChatCache,
  setPersistedChatCache,
} from "@/lib/gafcore-chat-cache.server";
import { logDev } from "@/lib/gafcore-logger.server";
import {
  auditAiActionCompleted,
  enforceAiGovernanceWithAudit,
} from "@/lib/gafcore-governance.server";
import { resolveChatAiAction } from "@/lib/gafcore-governance.shared";
import {
  buildPersistedSnapshotPromptAppend,
  loadProjectCodeSnapshot,
  persistProjectCodeSnapshot,
  priorityPathsFromPersistedSnapshot,
} from "@/lib/gafcore-edit-snapshot.server";
import { mergeIncrementalDelta } from "@/lib/gafcore-incremental-edit.shared";
import { runGafcoreAgentChatCompletion } from "@/lib/gafcore-chat-agent.server";
import { gateDeliveredFiles } from "@/lib/gafcore-chat-delivery-gate.shared";

export const gafcoreChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => gafcoreChatBodySchema.parse(input))
  .handler(async ({ data, context }) => {
    const t0 = Date.now();
    const userId = context.userId as string;

    const skipCredits = await isGafcoreAdminUser(userId);
    if (!skipCredits) {
      const limited = await enforceGafcoreChatRateLimit(userId);
      if (limited) {
        const err: Error & { code?: string } = new Error("rate_limited");
        err.code = "rate_limited";
        throw err;
      }
    }

    const projectAccess = await assertGafcoreProjectAccess(data.projectId, userId);
    if (!projectAccess.ok) {
      const err: Error & { code?: string } = new Error("project_not_found");
      err.code = "project_not_found";
      throw err;
    }

    const chatAction = resolveChatAiAction(data.instruction);
    const gov = await enforceAiGovernanceWithAudit({
      userId,
      action: chatAction,
      instruction: data.instruction,
      projectId: data.projectId,
      fileCount: data.files.length,
      isAdmin: skipCredits,
    });
    if (gov.blocked) {
      const err: Error & { code?: string } = new Error(gov.message || "AI bloqueada");
      err.code = gov.code ?? "ai_blocked";
      throw err;
    }

    let gateway: ReturnType<typeof getGafcoreAiGateway>;
    try {
      gateway = getGafcoreAiGateway();
    } catch {
      throw new Error("AI no configurado");
    }

    const projFiles = data.files as ProjFile[];
    const persistedSnapshot = await loadProjectCodeSnapshot(data.projectId, userId);
    void persistProjectCodeSnapshot(data.projectId, userId, projFiles);
    const recoveryAppend = buildPersistedSnapshotPromptAppend(persistedSnapshot, projFiles);
    const snapshotPriority = priorityPathsFromPersistedSnapshot(persistedSnapshot);

    const memory = await retrieveProjectMemoryContext({
      projectId: data.projectId,
      userId,
      instruction: data.instruction,
      files: projFiles,
    });
    const model = resolveGatewayModel(gateway, {
      instruction: data.instruction,
      hasVision: extractVisionImageParts(projFiles).length > 0,
    });
    const { messages, subset, ctxFiles } = buildGafcoreMessages(
      data,
      model,
      `${memory.promptAppendix}${recoveryAppend}`,
      [...memory.priorityPaths, ...snapshotPriority],
    );

    const cacheKey = buildGafcoreChatCacheKey({
      userId,
      model,
      instruction: data.instruction,
      files: data.files as ProjFile[],
      projectId: data.projectId,
    });
    let cached = shouldBypassGafcoreChatCache(data.instruction) ? null : cacheGet(cacheKey);
    if (!cached && !shouldBypassGafcoreChatCache(data.instruction)) {
      cached = await getPersistedChatCache(cacheKey);
      if (cached) cacheSet(cacheKey, cached);
    }
    if (cached) {
      const cachedGate = gateDeliveredFiles(projFiles, cached.files, data.instruction);
      const bal = await fetchBalance(userId);
      auditAiActionCompleted({
        userId,
        action: chatAction,
        instruction: data.instruction,
        projectId: data.projectId,
        risk: gov.risk,
        metadata: { cached: true },
      });
      logDev("gafcore_chat_cache_hit", { userId, model, ms: Date.now() - t0 });
      return {
        reply: sanitizeUserFacingAiText(softenRoboticReply(data.instruction, cached.reply)),
        files: cachedGate.ok ? cachedGate.files : [],
        balance: bal,
      };
    }

    let balanceAfterConsume: number | null = null;
    if (!skipCredits) {
      const credit = await consumeAiCredits(userId, COST_PER_REQUEST, "gafcore_chat", {
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

    let agentResult: Awaited<ReturnType<typeof runGafcoreAgentChatCompletion>>;
    try {
      agentResult = await runGafcoreAgentChatCompletion({
        model,
        messages,
        instruction: data.instruction,
        contextFiles: projFiles,
        enrichContext: data.files as ProjFile[],
      });
    } catch (e: unknown) {
      if (!skipCredits) {
        await refundAiCredits(userId, COST_PER_REQUEST, "gafcore_chat_refund", {
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

    const safeFiles = agentResult.files;
    const reply = sanitizeUserFacingAiText(
      softenRoboticReply(data.instruction, agentResult.reply),
    );

    if (shouldWriteGafcoreChatCache(safeFiles, { validationBlocked: agentResult.validationBlocked })) {
      cacheSet(cacheKey, { reply, files: safeFiles });
      void setPersistedChatCache(cacheKey, userId, model, { reply, files: safeFiles });
    }

    auditAiActionCompleted({
      userId,
      action: chatAction,
      instruction: data.instruction,
      projectId: data.projectId,
      risk: gov.risk,
    });

    const mergedForSnapshot =
      safeFiles.length > 0 ? mergeIncrementalDelta(projFiles, safeFiles) : projFiles;
    void persistProjectCodeSnapshot(data.projectId, userId, mergedForSnapshot);

    logDev("gafcore_chat_done", {
      userId,
      model,
      ms: Date.now() - t0,
      filesOut: safeFiles.length,
      agentAttempts: agentResult.attempts,
      validationBlocked: agentResult.validationBlocked,
    });

    return {
      reply,
      files: safeFiles,
      balance: balanceAfterConsume,
      validationBlocked: agentResult.validationBlocked && safeFiles.length === 0,
    };
  });
