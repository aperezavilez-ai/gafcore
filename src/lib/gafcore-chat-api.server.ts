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
  buildGafcoreChatCacheKey,
  shouldWriteGafcoreChatCache,
  fetchBalance,
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
import {
  runGafcoreAgentChatCompletion,
  type GafcoreAutoCorrectAgentEvent,
  type GafcoreAutoCorrectAgentReport,
} from "@/lib/gafcore-chat-agent.server";
import { resolveModelForGafcoreChat } from "@/services/ai/chat-brain.server";
import type { SafeBuildMeta } from "@/services/ai/safe-build.shared";
import { shouldBypassGafcoreChatCache } from "@/lib/gafcore-chat-intent.shared";
import { isFastWelcomeBuildInstruction } from "@/lib/gafcore-fast-build.shared";
import {
  getPersistedChatCache,
  setPersistedChatCache,
} from "@/lib/gafcore-chat-cache.server";
import { logDev, logWarn } from "@/lib/gafcore-logger.server";
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
import { gateDeliveredFiles } from "@/lib/gafcore-chat-delivery-gate.shared";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function buildAutoCorrectAgentReport(
  events: GafcoreAutoCorrectAgentEvent[],
  result: { attempts: number; validationBlocked: boolean },
): GafcoreAutoCorrectAgentReport {
  const repaired = events.some((event) => event.stage === "repair");
  const issueCount = events.reduce(
    (max, event) => Math.max(max, typeof event.issueCount === "number" ? event.issueCount : 0),
    0,
  );
  return {
    status: result.validationBlocked ? "blocked" : repaired ? "repaired" : "passed",
    attempts: result.attempts,
    repaired,
    issueCount,
    events: events.slice(-12),
  };
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

  const fastWelcome = isFastWelcomeBuildInstruction(data.instruction);
  const memory = fastWelcome
    ? { promptAppendix: "", priorityPaths: [] as string[] }
    : await retrieveProjectMemoryContext({
        projectId: data.projectId,
        userId,
        instruction: data.instruction,
        files: projFiles,
      });
  const pluginAppend = fastWelcome ? "" : await buildAiPluginPromptAppend(userId);
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
  const cacheKey = buildGafcoreChatCacheKey({
    userId,
    model,
    instruction: data.instruction,
    files: projFiles,
    projectId: data.projectId,
    brandName: brand?.name,
  });
  let cached = shouldBypassGafcoreChatCache(data.instruction) ? null : cacheGet(cacheKey);
  if (!cached && !shouldBypassGafcoreChatCache(data.instruction)) {
    cached = await getPersistedChatCache(cacheKey);
    if (cached) cacheSet(cacheKey, cached);
  }
  if (cached) {
    const cachedGate = await gateDeliveredFiles(projFiles, cached.files, data.instruction);
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
      reply: sanitizeUserFacingAiText(softenRoboticReply(data.instruction, cached.reply)),
      files: cachedGate.ok ? cachedGate.files : [],
      balance,
      cached: true,
      validationBlocked: cachedGate.files.length === 0 && cached.files.length > 0,
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

  // Transformador SSE: reemite los deltas de texto al cliente (efecto de
  // escritura en vivo) y, al cerrar el stream del modelo, corre el pipeline
  // completo (gate + Babel + reintentos) sobre el content acumulado SIN volver a
  // generar, emitiendo un evento final con los files YA validados.
  const encoder = new TextEncoder();
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  const transformed = new ReadableStream({
    async start(controller) {
      const decoder = new TextDecoder();
      let buffer = "";
      let full = "";
      let truncated = false;
      let lastProgressAt = 0;
      let lastProgressBucket = "";
      const autoCorrectEvents: GafcoreAutoCorrectAgentEvent[] = [];
      const emitProgress = (stage: string, message: string, force = false) => {
        const now = Date.now();
        const bucket = `${stage}:${message}`;
        if (!force && bucket === lastProgressBucket && now - lastProgressAt < 2_500) return;
        lastProgressAt = now;
        lastProgressBucket = bucket;
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ gafcore: "progress", stage, message })}\n\n`),
        );
      };
      const closeStream = () => {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      };

      try {
        emitProgress(
          "context",
          `Preparando contexto real del proyecto: ${ctxFiles.length} archivos enviados`,
          true,
        );
        emitProgress("connect", "Analizando la solicitud y preparando la generacion de archivos", true);

        const upstream = await streamChatCompletions({ model, messages, json: true, maxTokens: 16000 });

        if (!upstream.ok) {
          if (!skipCredits) {
            await refundAiCredits(userId, COST_PER_REQUEST, "gafcore_chat_stream_refund", {
              status: upstream.status,
            });
          }
          const fail = await parseUpstreamFailure(upstream);
          // Stream no disponible: misma petición en modo JSON (créditos ya consumidos),
          // pero manteniendo SSE para que el chat siga viendo progreso real.
          if (fail.status >= 400 && fail.status !== 429) {
            try {
              emitProgress("fallback", "El stream IA fallo; generando respuesta completa de respaldo", true);
              const completed = await completeChatMessage({ model, messages, json: true });
              const content = completed.content || "{}";
              const parsedOut = parseJsonLoose<{ reply?: string; files?: unknown }>(content) ?? {};
              if (!parsedOut.reply && !parsedOut.files) {
                console.warn("[gafcore-chat] stream-fallback non-JSON content len=" + content.length);
              }
              const replyRaw = typeof parsedOut.reply === "string" ? parsedOut.reply : "Listo.";
              emitProgress("validating", "Validando archivos del respaldo antes del preview", true);
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
              if (shouldWriteGafcoreChatCache(finalized.files)) {
                cacheSet(cacheKey, payload);
                void setPersistedChatCache(cacheKey, userId, model, payload);
              }
              persistSnapshotAfterChat(data.projectId, userId, projFiles, finalized.files);
              auditAiActionCompleted({
                userId,
                action,
                instruction: data.instruction,
                projectId: data.projectId,
                risk: gov.risk,
                metadata: { fallback: "complete", safeBuild: finalized.safeBuild },
              });
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    gafcore: "final",
                    reply,
                    files: finalized.files,
                    fallback: "complete",
                    safeBuild: finalized.safeBuild,
                  })}\n\n`,
                ),
              );
              closeStream();
              return;
            } catch {
              /* sigue con error upstream */
            }
          }
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                gafcore: "final",
                error: fail.code === "rate_limited" ? "rate_limited" : "upstream",
                detail: sanitizeApiErrorDetail(fail.detail) ?? "Error temporal del asistente.",
              })}\n\n`,
            ),
          );
          closeStream();
          return;
        }

        if (!upstream.body) {
          if (!skipCredits) {
            await refundAiCredits(userId, COST_PER_REQUEST, "gafcore_chat_stream_refund", {
              reason: "no_body",
            });
          }
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ gafcore: "final", error: "no_stream_body" })}\n\n`,
            ),
          );
          closeStream();
          return;
        }

        auditAiActionCompleted({
          userId,
          action,
          instruction: data.instruction,
          projectId: data.projectId,
          risk: gov.risk,
          metadata: { mode: "stream" },
        });

        emitProgress("stream", "Stream IA conectado; esperando el primer bloque de codigo", true);
        reader = upstream.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const j = JSON.parse(payload) as {
                choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
              };
              const piece = j?.choices?.[0]?.delta?.content;
              if (typeof piece === "string" && piece.length > 0) {
                full += piece;
                if (full.length > 500) {
                  const kb = Math.max(1, Math.round(full.length / 1024));
                  emitProgress("stream", `IA generando archivos: ${kb} KB recibidos`);
                }
                // Passthrough del delta al cliente (mismo shape OpenAI que ya parsea).
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`),
                );
              }
              if (j?.choices?.[0]?.finish_reason === "length") truncated = true;
            } catch {
              /* línea SSE parcial */
            }
          }
        }
      } catch (err) {
        // Si el upstream falla a media transmisión, intentamos cerrar con lo que haya.
        logDev("gafcore_chat_stream_read_error", { error: String(err) });
      }

      // Pipeline de validación sobre el content acumulado (sin segunda generación).
      try {
        emitProgress("validating", "Validando archivos antes de actualizar el preview", true);
        const agentResult = await runGafcoreAgentChatCompletion({
          model,
          messages,
          instruction: data.instruction,
          contextFiles: projFiles,
          enrichContext: data.files as ProjFile[],
          seedFirstContent: full,
          seedTruncated: truncated,
          onProgress: (event) => {
            autoCorrectEvents.push(event);
            emitProgress(`agent:${event.stage}`, event.message, true);
          },
        });
        const reply = sanitizeUserFacingAiText(
          softenRoboticReply(data.instruction, agentResult.reply),
        );
        const deliveredFiles = agentResult.files;
        const validationBlocked = agentResult.validationBlocked && deliveredFiles.length === 0;
        if (deliveredFiles.length > 0) {
          const fileList = deliveredFiles
            .slice(0, 4)
            .map((file) => file.name)
            .join(", ");
          emitProgress(
            "files",
            `Archivos generados y validados: ${fileList}${deliveredFiles.length > 4 ? "..." : ""}`,
            true,
          );
        }
        emitProgress(
          validationBlocked ? "blocked" : "preview",
          validationBlocked
            ? "La validacion bloqueo los archivos generados"
            : "Actualizando el area de trabajo",
          true,
        );

        if (shouldWriteGafcoreChatCache(deliveredFiles)) {
          const payload = { reply, files: deliveredFiles };
          cacheSet(cacheKey, payload);
          void setPersistedChatCache(cacheKey, userId, model, payload);
        }
        persistSnapshotAfterChat(data.projectId, userId, projFiles, deliveredFiles);

        const balance = await fetchBalance(userId);
        const autoCorrectAgent = buildAutoCorrectAgentReport(autoCorrectEvents, agentResult);
        const finalEvent = {
          gafcore: "final" as const,
          reply,
          files: deliveredFiles,
          validationBlocked,
          autoCorrectAgent,
          balance,
          safeBuild: {
            phase: "ready" as const,
            repaired: autoCorrectAgent.repaired,
            skipped: false,
          },
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalEvent)}\n\n`));
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ gafcore: "final", error: "pipeline_failed", detail: String((err as Error)?.message ?? err).slice(0, 200) })}\n\n`,
          ),
        );
      }
      closeStream();
    },
    cancel() {
      void reader?.cancel();
    },
  });

  return new Response(transformed, {
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

  const fastWelcomeComplete = isFastWelcomeBuildInstruction(data.instruction);
  const memory = fastWelcomeComplete
    ? { promptAppendix: "", priorityPaths: [] as string[] }
    : await retrieveProjectMemoryContext({
        projectId: data.projectId,
        userId,
        instruction: data.instruction,
        files: projFilesComplete,
      });
  const pluginAppend = fastWelcomeComplete ? "" : await buildAiPluginPromptAppend(userId);
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

  const cacheKey = buildGafcoreChatCacheKey({
    userId,
    model,
    instruction: data.instruction,
    files: projFilesComplete,
    projectId: data.projectId,
    brandName: brand?.name,
  });
  let cachedComplete = shouldBypassGafcoreChatCache(data.instruction) ? null : cacheGet(cacheKey);
  if (!cachedComplete && !shouldBypassGafcoreChatCache(data.instruction)) {
    cachedComplete = await getPersistedChatCache(cacheKey);
    if (cachedComplete) cacheSet(cacheKey, cachedComplete);
  }
  if (cachedComplete) {
    const cachedGate = await gateDeliveredFiles(
      projFilesComplete,
      cachedComplete.files,
      data.instruction,
    );
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
      reply: sanitizeUserFacingAiText(
        softenRoboticReply(data.instruction, cachedComplete.reply),
      ),
      files: cachedGate.ok ? cachedGate.files : [],
      balance: bal,
      cached: true,
      validationBlocked: cachedGate.files.length === 0 && cachedComplete.files.length > 0,
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
  const autoCorrectEventsComplete: GafcoreAutoCorrectAgentEvent[] = [];
  try {
    agentResult = await runGafcoreAgentChatCompletion({
      model,
      messages,
      instruction: data.instruction,
      contextFiles: projFilesComplete,
      enrichContext: data.files as ProjFile[],
      onProgress: (event) => {
        autoCorrectEventsComplete.push(event);
      },
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

  // El agente ya ejecutó finalize + gate + heal. NO volver a finalizeGafcoreBuildDelivery
  // (triple shield restauraba App.tsx y vaciaba filesToApply en cliente).
  const reply = sanitizeUserFacingAiText(
    softenRoboticReply(data.instruction, agentResult.reply),
  );
  const deliveredFiles = agentResult.files;
  const autoCorrectAgent = buildAutoCorrectAgentReport(autoCorrectEventsComplete, agentResult);

  const finalPayload = { reply, files: deliveredFiles };
  if (
    shouldWriteGafcoreChatCache(deliveredFiles, {
      validationBlocked: agentResult.validationBlocked,
    })
  ) {
    cacheSet(cacheKey, finalPayload);
    void setPersistedChatCache(cacheKey, userId, model, finalPayload);
  }
  persistSnapshotAfterChat(data.projectId, userId, projFilesComplete, deliveredFiles);

  auditAiActionCompleted({
    userId,
    action,
    instruction: data.instruction,
    projectId: data.projectId,
    risk: gov.risk,
    metadata: {
      mode: "complete",
      agentAttempts: agentResult.attempts,
      agentDelivered: deliveredFiles.length > 0,
      autoCorrectAgent,
    },
  });

  if (agentResult.validationBlocked && deliveredFiles.length === 0) {
    logWarn("gafcore_chat_validation_blocked", {
      projectId: data.projectId,
      instructionLen: data.instruction.length,
      agentAttempts: agentResult.attempts,
    });
  }

  return jsonResponse({
    reply,
    files: deliveredFiles,
    balance: balanceAfterConsume,
    agentDelivered: deliveredFiles.length > 0,
    autoCorrectAgent,
    safeBuild: { phase: "ready", repaired: autoCorrectAgent.repaired, skipped: false },
    validationBlocked: agentResult.validationBlocked && deliveredFiles.length === 0,
  });
}
