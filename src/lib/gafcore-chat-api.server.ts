/**
 * Handlers HTTP del chat IDE — invocados desde `server.ts` sin pasar por el entry SSR
 * (en Vercel el server-entry devuelve HTTPError 500 y el chat quedaba en HTML de error).
 */
import { requireGafcoreApiUser } from "@/lib/gafcore-api-auth.server";
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
import { isGafcoreAdminUser } from "@/lib/gafcore-admin-role.server";
import { retrieveProjectMemoryContext } from "@/memory/retrieve.server";
import {
  completeChatMessage,
  consumeAiCredits,
  getGafcoreAiGateway,
  parseUpstreamFailure,
  refundAiCredits,
  resolveGatewayModel,
  streamChatCompletions,
} from "@/lib/gafcore-ai-gateway.server";
import { shouldBypassGafcoreChatCache } from "@/lib/gafcore-chat-intent.shared";
import { sanitizeUserFacingAiText } from "@/lib/gafcore-user-facing-errors";
import { enrichGafcoreOutputFiles } from "@/lib/gafcore-media.server";
import { extractVisionImageParts, patchProjectFilesVisually } from "@/lib/gafcore-media.shared";
import { softenRoboticReply } from "@/lib/gafcore-chat-intent.shared";
import { buildAiPluginPromptAppend } from "@/extensions/ai-plugins.server";
import { readProjectBrand } from "@/lib/gafcore-brand.functions";
import { brandContextBlock } from "@/lib/gafcore-brand.shared";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
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

  let gateway: ReturnType<typeof getGafcoreAiGateway>;
  try {
    gateway = getGafcoreAiGateway();
  } catch {
    return jsonResponse({ error: "ai_not_configured" }, 500);
  }

  const memory = await retrieveProjectMemoryContext({
    projectId: data.projectId,
    userId,
    instruction: data.instruction,
    files: data.files as ProjFile[],
  });
  const pluginAppend = await buildAiPluginPromptAppend(userId);
  const promptAppendix = [memory.promptAppendix, pluginAppend].filter(Boolean).join("\n\n");
  const brand = await readProjectBrand(data.projectId);
  const brandBlock = brand ? brandContextBlock(brand) : "";
  const model = resolveGatewayModel(gateway, {
    instruction: data.instruction,
    hasVision: data.files.some((f) => f.content.trim().startsWith("data:image/")),
  });
  const { messages, subset, ctxFiles } = buildGafcoreMessages(
    data,
    model,
    promptAppendix,
    memory.priorityPaths,
    brandBlock,
  );
  const cacheKey = `${userId}:${model}:${instructionKey(data.instruction)}:${projectCacheFingerprint(data.files as ProjFile[])}:${brand?.name ?? ""}`;
  const cached = shouldBypassGafcoreChatCache(data.instruction) ? null : cacheGet(cacheKey);
  if (cached) {
    const balance = await fetchBalance(userId);
    return jsonResponse({
      reply: cached.reply,
      files: cached.files,
      balance,
      cached: true,
    });
  }

  const skipCredits = await isGafcoreAdminUser(userId);
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
        let parsedOut: { reply?: string; files?: unknown };
        try {
          parsedOut = JSON.parse(content);
        } catch {
          return jsonResponse({
            reply: sanitizeUserFacingAiText(softenRoboticReply(data.instruction, content)),
            files: [],
          });
        }
        let safeFiles = validateOutputFiles(parsedOut.files);
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
        } catch {
          /* optional */
        }
        const reply = sanitizeUserFacingAiText(
          softenRoboticReply(
            data.instruction,
            typeof parsedOut.reply === "string" ? parsedOut.reply : "Listo.",
          ),
        );
        cacheSet(cacheKey, { reply, files: safeFiles });
        return jsonResponse({ reply, files: safeFiles, fallback: "complete" });
      } catch {
        /* sigue con error upstream */
      }
    }
    return jsonResponse(
      {
        error: fail.code === "rate_limited" ? "rate_limited" : "upstream",
        detail: fail.detail,
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

  let gateway: ReturnType<typeof getGafcoreAiGateway>;
  try {
    gateway = getGafcoreAiGateway();
  } catch {
    return jsonResponse({ error: "ai_not_configured" }, 500);
  }

  const memory = await retrieveProjectMemoryContext({
    projectId: data.projectId,
    userId,
    instruction: data.instruction,
    files: data.files as ProjFile[],
  });
  const pluginAppend = await buildAiPluginPromptAppend(userId);
  const promptAppendix = [memory.promptAppendix, pluginAppend].filter(Boolean).join("\n\n");
  const brand = await readProjectBrand(data.projectId);
  const brandBlock = brand ? brandContextBlock(brand) : "";
  const model = resolveGatewayModel(gateway, {
    instruction: data.instruction,
    hasVision: extractVisionImageParts(data.files as ProjFile[]).length > 0,
  });
  const { messages, subset, ctxFiles } = buildGafcoreMessages(
    data,
    model,
    promptAppendix,
    memory.priorityPaths,
    brandBlock,
  );

  const cacheKey = `${userId}:${model}:${instructionKey(data.instruction)}:${projectCacheFingerprint(data.files as ProjFile[])}:${brand?.name ?? ""}`;
  const cached = shouldBypassGafcoreChatCache(data.instruction) ? null : cacheGet(cacheKey);
  if (cached) {
    const bal = await fetchBalance(userId);
    return jsonResponse({
      reply: sanitizeUserFacingAiText(softenRoboticReply(data.instruction, cached.reply)),
      files: cached.files,
      balance: bal,
    });
  }

  const skipCredits = await isGafcoreAdminUser(userId);
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

  let content: string;
  try {
    const completed = await completeChatMessage({ model, messages, json: true });
    content = completed.content || "{}";
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
    return jsonResponse({ error: "upstream", detail: err.message }, 502);
  }

  let parsedOut: { reply?: string; files?: unknown };
  try {
    parsedOut = JSON.parse(content);
  } catch {
    return jsonResponse({
      reply: sanitizeUserFacingAiText(softenRoboticReply(data.instruction, content)),
      files: [],
      balance: balanceAfterConsume,
    });
  }

  let safeFiles = validateOutputFiles(parsedOut.files);
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
  } catch {
    /* enrich opcional */
  }

  const reply = sanitizeUserFacingAiText(
    softenRoboticReply(
      data.instruction,
      typeof parsedOut.reply === "string" ? parsedOut.reply : "Listo.",
    ),
  );

  cacheSet(cacheKey, { reply, files: safeFiles });

  return jsonResponse({
    reply,
    files: safeFiles,
    balance: balanceAfterConsume,
  });
}
