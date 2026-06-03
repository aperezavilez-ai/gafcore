/**
 * Handlers HTTP del chat IDE — invocados desde `server.ts` sin pasar por el entry SSR
 * (en Vercel el server-entry devuelve HTTPError 500 y el chat quedaba en HTML de error).
 */
import { requireGafcoreApiUser } from "@/lib/gafcore-api-auth.server";
import { enforceGafcoreChatRateLimit } from "@/lib/gafcore-api-ratelimit.server";
import { assertGafcoreProjectAccess } from "@/lib/gafcore-project-access.server";
import {
  gafcoreChatBodySchema,
  buildGafcoreMessages,
  cacheGet,
  cacheSet,
  fetchBalance,
  instructionKey,
  projectCacheFingerprint,
  COST_PER_REQUEST,
  type ProjFile,
} from "@/lib/gafcore-chat.shared";
import { isGafcoreAdminUser } from "@/lib/gafcore-admin-role.server";
import { retrieveProjectMemoryContext } from "@/memory/retrieve.server";
import {
  completeChatMessage,
  consumeAiCredits,
  getGafcoreAiGateway,
  parseUpstreamFailure,
  refundAiCredits,
  streamChatCompletions,
} from "@/lib/gafcore-ai-gateway.server";
import { runGafcoreAgentChatCompletion } from "@/lib/gafcore-chat-agent.server";
import { resolveModelForGafcoreChat } from "@/services/ai/chat-brain.server";
import type { SafeBuildMeta } from "@/services/ai/safe-build.shared";
import { shouldBypassGafcoreChatCache } from "@/lib/gafcore-chat-intent.shared";
import {
  getPersistedChatCache,
  setPersistedChatCache,
} from "@/lib/gafcore-chat-cache.server";
import { logDev } from "@/lib/gafcore-logger.server";
import {
  sanitizeApiErrorDetail,
  sanitizeUserFacingAiText,
} from "@/lib/gafcore-user-facing-errors";
import { enrichGafcoreOutputFiles } from "@/lib/gafcore-media.server";
import { extractVisionImageParts } from "@/lib/gafcore-media.shared";
import { softenRoboticReply } from "@/lib/gafcore-chat-intent.shared";
import { finalizeGafcoreBuildDelivery } from "@/lib/gafcore-chat-delivery.shared";
import { buildAiPluginPromptAppend } from "@/extensions/ai-plugins.server";
import { readProjectBrand } from "@/lib/gafcore-brand.functions";
import { brandContextBlock } from "@/lib/gafcore-brand.shared";
import { parseJsonLoose } from "@/lib/gafcore-json-loose.shared";
import {
  auditAiActionCompleted,
  enforceAiGovernanceWithAudit,
  type GafcoreGovernanceResult,
} from "@/lib/gafcore-governance.server";
import {
  governanceBlockedHttpStatus,
  resolveChatAiAction,
  type GafcoreAiAction,
} from "@/lib/gafcore-governance.shared";
import {
  buildPersistedSnapshotPromptAppend,
  loadProjectCodeSnapshot,
  persistProjectCodeSnapshot,
  priorityPathsFromPersistedSnapshot,
} from "@/lib/gafcore-edit-snapshot.server";
import { mergeIncrementalDelta } from "@/lib/gafcore-incremental-edit.shared";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function persistSnapshotAfterChat(
  projectId: string | undefined,
  userId: string,
  baseline: ProjFile[],
  output: Array<{ name: string; content: string; language?: string }>,
): void {
  const merged =
    output.length > 0 ? mergeIncrementalDelta(baseline, output as ProjFile[]) : baseline;
  void persistProjectCodeSnapshot(projectId, userId, merged);
}

async function deliverGafcoreChatFiles(
  instruction: string,
  contextFiles: ProjFile[],
  replyRaw: string,
  rawFiles: unknown,
): Promise<Array<{ name: string; language?: string; content: string }>> {
  const delivery = finalizeGafcoreBuildDelivery(
    instruction,
    contextFiles,
    replyRaw,
    rawFiles,
  );
  try {
    return await enrichGafcoreOutputFiles(delivery.files, contextFiles, instruction);
  } catch {
    return delivery.files;
  }
}

async function finalizeChatDeliveryWithSafeBuild(input: {
  instruction: string;
  contextFiles: ProjFile[];
  replyRaw: string;
  rawFiles: unknown;
  messages: ReturnType<typeof buildGafcoreMessages>["messages"];
  gateway: ReturnType<typeof getGafcoreAiGateway>;
}): Promise<{
  reply: string;
  files: Array<{ name: string; language?: string; content: string }>;
  safeBuild: SafeBuildMeta;
}> {
  const delivered = await deliverGafcoreChatFiles(
    input.instruction,
    input.contextFiles,
    input.replyRaw,
    input.rawFiles,
  );

  // Validación en cliente (ChatPanel); omitir bucle Safe-Build servidor (ahorra 2–3 llamadas IA / petición).
  return {
    reply: input.replyRaw,
    files: delivered,
    safeBuild: { phase: "ready", repaired: false, skipped: true },
  };
}

async function enforceChatGovernanceOrResponse(
  userId: string,
  data: { instruction: string; projectId: string; files: ProjFile[] },
  skipCredits: boolean,
): Promise<
  | Response
  | { gov: GafcoreGovernanceResult; action: GafcoreAiAction }
> {
  const action = resolveChatAiAction(data.instruction);
  const gov = await enforceAiGovernanceWithAudit({
    userId,
    action,
    instruction: data.instruction,
    projectId: data.projectId,
    fileCount: data.files.length,
    isAdmin: skipCredits,
  });
  if (gov.blocked) {
    return jsonResponse(
      { error: gov.code ?? "ai_blocked", detail: gov.message },
      governanceBlockedHttpStatus(gov.code),
    );
  }
  return { gov, action };
}

/** POST /api/gafcore/chat/stream */
export async function handleGafcoreChatStreamPost(request: Request): Promise<Response> {
  const userId = await requireGafcoreApiUser(request);
  if (userId instanceof Response) return userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const parsed = gafcoreChatBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: "invalid_body" }, 400);
  }
  const data = parsed.data;

  const skipCredits = await isGafcoreAdminUser(userId);
  if (!skipCredits) {
    const limited = await enforceGafcoreChatRateLimit(userId);
    if (limited) return limited;
  }

  const projectAccess = await assertGafcoreProjectAccess(data.projectId, userId);
  if (!projectAccess.ok) return projectAccess.response;

  const govResult = await enforceChatGovernanceOrResponse(
    userId,
    { instruction: data.instruction, projectId: data.projectId, files: data.files as ProjFile[] },
    skipCredits,
  );
  if (govResult instanceof Response) return govResult;
  const { gov, action } = govResult;

  let gateway: ReturnType<typeof getGafcoreAiGateway>;
  try {
    gateway = getGafcoreAiGateway();
  } catch {
    return jsonResponse({ error: "ai_not_configured" }, 500);
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
  const pluginAppend = await buildAiPluginPromptAppend(userId);
  const promptAppendix = [memory.promptAppendix, pluginAppend, recoveryAppend]
    .filter(Boolean)
    .join("\n\n");
  const brand = await readProjectBrand(data.projectId);
  const brandBlock = brand ? brandContextBlock(brand) : "";
  const hasVision = extractVisionImageParts(projFiles).length > 0;
  const { model } = resolveModelForGafcoreChat(gateway, data.instruction, {
    hasVision,
    deepMode: data.deepMode === true,
  });
  const { messages, subset, ctxFiles } = buildGafcoreMessages(
    data,
    model,
    promptAppendix,
    [...memory.priorityPaths, ...snapshotPriority],
    brandBlock,
  );
  const cacheKey = `${userId}:${model}:${instructionKey(data.instruction)}:${projectCacheFingerprint(data.files as ProjFile[])}:${brand?.name ?? ""}`;
  let cached = shouldBypassGafcoreChatCache(data.instruction) ? null : cacheGet(cacheKey);
  if (!cached && !shouldBypassGafcoreChatCache(data.instruction)) {
    cached = await getPersistedChatCache(cacheKey);
    if (cached) cacheSet(cacheKey, cached);
  }
  if (cached) {
    const balance = await fetchBalance(userId);
    auditAiActionCompleted({
      userId,
      action,
      instruction: data.instruction,
      projectId: data.projectId,
      risk: gov.risk,
      metadata: { cached: true, source: "cache" },
    });
    logDev("chat_cache_served", { mode: "stream", credits: 0 });
    return jsonResponse({
      reply: cached.reply,
      files: cached.files,
      balance,
      cached: true,
      safeBuild: { phase: "ready", repaired: false, skipped: true },
    });
  }

  if (!skipCredits) {
    const credit = await consumeAiCredits(userId, COST_PER_REQUEST, "gafcore_chat_stream", {
      instruction_len: data.instruction.length,
      model,
      ctx_files: ctxFiles.length,
      subset,
    });
    if (!credit.ok) {
      const err =
        credit.error === "insufficient_credits" ? "insufficient_credits" : "credits_error";
      return jsonResponse({ error: err }, credit.error === "insufficient_credits" ? 402 : 500);
    }
  }

  const upstream = await streamChatCompletions({ model, messages, json: true });

  if (!upstream.ok) {
    if (!skipCredits) {
      await refundAiCredits(userId, COST_PER_REQUEST, "gafcore_chat_stream_refund", {
        status: upstream.status,
      });
    }
    const fail = await parseUpstreamFailure(upstream);
    // Stream no disponible: misma petición en modo JSON (créditos ya consumidos).
    if (fail.status >= 400 && fail.status !== 429) {
      try {
        const completed = await completeChatMessage({ model, messages, json: true });
        const content = completed.content || "{}";
        const parsedOut = parseJsonLoose<{ reply?: string; files?: unknown }>(content) ?? {};
        if (!parsedOut.reply && !parsedOut.files) {
          console.warn("[gafcore-chat] stream-fallback non-JSON content len=" + content.length);
        }
        const replyRaw = typeof parsedOut.reply === "string" ? parsedOut.reply : "Listo.";
        const finalized = await finalizeChatDeliveryWithSafeBuild({
          instruction: data.instruction,
          contextFiles: data.files as ProjFile[],
          replyRaw,
          rawFiles: parsedOut.files,
          messages,
          gateway,
        });
        const reply = sanitizeUserFacingAiText(
          softenRoboticReply(data.instruction, finalized.reply),
        );
        const payload = { reply, files: finalized.files };
        cacheSet(cacheKey, payload);
        void setPersistedChatCache(cacheKey, userId, model, payload);
        persistSnapshotAfterChat(data.projectId, userId, projFiles, finalized.files);
        auditAiActionCompleted({
          userId,
          action,
          instruction: data.instruction,
          projectId: data.projectId,
          risk: gov.risk,
          metadata: { fallback: "complete", safeBuild: finalized.safeBuild },
        });
        return jsonResponse({
          reply,
          files: finalized.files,
          fallback: "complete",
          safeBuild: finalized.safeBuild,
        });
      } catch {
        /* sigue con error upstream */
      }
    }
    return jsonResponse(
      {
        error: fail.code === "rate_limited" ? "rate_limited" : "upstream",
        detail: sanitizeApiErrorDetail(fail.detail) ?? "Error temporal del asistente.",
      },
      fail.status >= 400 ? fail.status : 502,
    );
  }

  if (!upstream.body) {
    if (!skipCredits) {
      await refundAiCredits(userId, COST_PER_REQUEST, "gafcore_chat_stream_refund", {
        reason: "no_body",
      });
    }
    return jsonResponse({ error: "no_stream_body" }, 502);
  }

  auditAiActionCompleted({
    userId,
    action,
    instruction: data.instruction,
    projectId: data.projectId,
    risk: gov.risk,
    metadata: { mode: "stream" },
  });

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "x-gafcore-chat-handler": "direct",
    },
  });
}

/** POST /api/gafcore/chat/complete — JSON (fallback cuando el stream/SSR falla). */
export async function handleGafcoreChatCompletePost(request: Request): Promise<Response> {
  const userId = await requireGafcoreApiUser(request);
  if (userId instanceof Response) return userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const parsed = gafcoreChatBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: "invalid_body" }, 400);
  }
  const data = parsed.data;

  const skipCredits = await isGafcoreAdminUser(userId);
  if (!skipCredits) {
    const limited = await enforceGafcoreChatRateLimit(userId);
    if (limited) return limited;
  }

  const projectAccess = await assertGafcoreProjectAccess(data.projectId, userId);
  if (!projectAccess.ok) return projectAccess.response;

  const govResult = await enforceChatGovernanceOrResponse(
    userId,
    { instruction: data.instruction, projectId: data.projectId, files: data.files as ProjFile[] },
    skipCredits,
  );
  if (govResult instanceof Response) return govResult;
  const { gov, action } = govResult;

  let gateway: ReturnType<typeof getGafcoreAiGateway>;
  try {
    gateway = getGafcoreAiGateway();
  } catch {
    return jsonResponse({ error: "ai_not_configured" }, 500);
  }

  const projFilesComplete = data.files as ProjFile[];
  const persistedSnapshotComplete = await loadProjectCodeSnapshot(data.projectId, userId);
  void persistProjectCodeSnapshot(data.projectId, userId, projFilesComplete);
  const recoveryAppendComplete = buildPersistedSnapshotPromptAppend(
    persistedSnapshotComplete,
    projFilesComplete,
  );
  const snapshotPriorityComplete = priorityPathsFromPersistedSnapshot(persistedSnapshotComplete);

  const memory = await retrieveProjectMemoryContext({
    projectId: data.projectId,
    userId,
    instruction: data.instruction,
    files: projFilesComplete,
  });
  const pluginAppend = await buildAiPluginPromptAppend(userId);
  const promptAppendix = [memory.promptAppendix, pluginAppend, recoveryAppendComplete]
    .filter(Boolean)
    .join("\n\n");
  const brand = await readProjectBrand(data.projectId);
  const brandBlock = brand ? brandContextBlock(brand) : "";
  const hasVisionComplete = extractVisionImageParts(projFilesComplete).length > 0;
  const { model } = resolveModelForGafcoreChat(gateway, data.instruction, {
    hasVision: hasVisionComplete,
    deepMode: data.deepMode === true,
  });
  const { messages, subset, ctxFiles } = buildGafcoreMessages(
    data,
    model,
    promptAppendix,
    [...memory.priorityPaths, ...snapshotPriorityComplete],
    brandBlock,
  );

  const cacheKey = `${userId}:${model}:${instructionKey(data.instruction)}:${projectCacheFingerprint(projFilesComplete)}:${brand?.name ?? ""}`;
  let cachedComplete = shouldBypassGafcoreChatCache(data.instruction) ? null : cacheGet(cacheKey);
  if (!cachedComplete && !shouldBypassGafcoreChatCache(data.instruction)) {
    cachedComplete = await getPersistedChatCache(cacheKey);
    if (cachedComplete) cacheSet(cacheKey, cachedComplete);
  }
  if (cachedComplete) {
    const bal = await fetchBalance(userId);
    auditAiActionCompleted({
      userId,
      action,
      instruction: data.instruction,
      projectId: data.projectId,
      risk: gov.risk,
      metadata: { cached: true, mode: "complete" },
    });
    logDev("chat_cache_served", { mode: "complete", credits: 0 });
    return jsonResponse({
      reply: sanitizeUserFacingAiText(softenRoboticReply(data.instruction, cachedComplete.reply)),
      files: cachedComplete.files,
      balance: bal,
      cached: true,
      safeBuild: { phase: "ready", repaired: false, skipped: true },
    });
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
      const err =
        credit.error === "insufficient_credits" ? "insufficient_credits" : "credits_error";
      return jsonResponse({ error: err }, credit.error === "insufficient_credits" ? 402 : 500);
    }
    balanceAfterConsume = credit.balance;
  }

  let agentResult: Awaited<ReturnType<typeof runGafcoreAgentChatCompletion>>;
  try {
    agentResult = await runGafcoreAgentChatCompletion({
      model,
      messages,
      instruction: data.instruction,
      contextFiles: projFilesComplete,
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
      return jsonResponse({ error: "insufficient_credits" }, 402);
    }
    if (err.code === "rate_limited") {
      return jsonResponse({ error: "rate_limited" }, 429);
    }
    return jsonResponse(
      {
        error: "upstream",
        detail: sanitizeApiErrorDetail(err.message) ?? "Error temporal del asistente.",
      },
      502,
    );
  }

  const finalized = await finalizeChatDeliveryWithSafeBuild({
    instruction: data.instruction,
    contextFiles: projFilesComplete,
    replyRaw: agentResult.reply,
    rawFiles: agentResult.files,
    messages,
    gateway,
  });

  const reply = sanitizeUserFacingAiText(
    softenRoboticReply(data.instruction, finalized.reply),
  );

  const finalPayload = { reply, files: finalized.files };
  cacheSet(cacheKey, finalPayload);
  void setPersistedChatCache(cacheKey, userId, model, finalPayload);
  persistSnapshotAfterChat(data.projectId, userId, projFilesComplete, finalized.files);

  auditAiActionCompleted({
    userId,
    action,
    instruction: data.instruction,
    projectId: data.projectId,
    risk: gov.risk,
    metadata: { mode: "complete", safeBuild: finalized.safeBuild },
  });

  return jsonResponse({
    reply,
    files: finalized.files,
    balance: balanceAfterConsume,
    safeBuild: finalized.safeBuild,
  });
}
