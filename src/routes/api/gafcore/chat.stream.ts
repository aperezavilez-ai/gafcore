import { createFileRoute } from "@tanstack/react-router";
import { requireUser } from "@/routes/api/elevenlabs/-_auth";
import {
  gafcoreChatBodySchema,
  buildGafcoreMessages,
  cacheGet,
  fetchBalance,
  instructionKey,
  projectCacheFingerprint,
  COST_PER_REQUEST,
  type ProjFile,
} from "@/lib/gafcore-chat.shared";
import { isGafcoreAdminUser } from "@/lib/gafcore-admin-role.server";
import { loadProjectMemoryHintsForUser } from "@/lib/gafcore-ai-memory.server";
import {
  consumeAiCredits,
  getGafcoreAiGateway,
  parseUpstreamFailure,
  refundAiCredits,
  resolveGatewayModel,
  streamChatCompletions,
} from "@/lib/gafcore-ai-gateway.server";
import { shouldBypassGafcoreChatCache } from "@/lib/gafcore-chat-intent.shared";

/**
 * POST /api/gafcore/chat/stream
 * SSE OpenAI-compatible (mismo prompt que gafcoreChat).
 * Respuesta cacheable como JSON (sin stream) cuando aplica.
 */
export const Route = createFileRoute("/api/gafcore/chat/stream")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const userId = await requireUser(request);
        if (userId instanceof Response) return userId;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "invalid_json" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const parsed = gafcoreChatBodySchema.safeParse(body);
        if (!parsed.success) {
          return new Response(JSON.stringify({ error: "invalid_body" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const data = parsed.data;

        let gateway: ReturnType<typeof getGafcoreAiGateway>;
        try {
          gateway = getGafcoreAiGateway();
        } catch {
          return new Response(JSON.stringify({ error: "ai_not_configured" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const memoryHints = data.projectId
          ? await loadProjectMemoryHintsForUser(data.projectId, userId)
          : "";
        const model = resolveGatewayModel(gateway, {
          instruction: data.instruction,
          hasVision: data.files.some((f) => f.content.trim().startsWith("data:image/")),
        });
        const { messages, subset, ctxFiles } = buildGafcoreMessages(data, model, memoryHints);
        const cacheKey = `${userId}:${model}:${instructionKey(data.instruction)}:${projectCacheFingerprint(data.files as ProjFile[])}`;
        const cached = shouldBypassGafcoreChatCache(data.instruction) ? null : cacheGet(cacheKey);
        if (cached) {
          const balance = await fetchBalance(userId);
          return new Response(
            JSON.stringify({
              reply: cached.reply,
              files: cached.files,
              balance,
              cached: true,
            }),
            { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } },
          );
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
            const err = credit.error === "insufficient_credits" ? "insufficient_credits" : "credits_error";
            return new Response(JSON.stringify({ error: err }), {
              status: credit.error === "insufficient_credits" ? 402 : 500,
              headers: { "Content-Type": "application/json" },
            });
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
          return new Response(
            JSON.stringify({
              error: fail.code === "rate_limited" ? "rate_limited" : "upstream",
              detail: fail.detail,
            }),
            {
              status: fail.status >= 400 ? fail.status : 502,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        if (!upstream.body) {
          if (!skipCredits) {
            await refundAiCredits(userId, COST_PER_REQUEST, "gafcore_chat_stream_refund", {
              reason: "no_body",
            });
          }
          return new Response(JSON.stringify({ error: "no_stream_body" }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(upstream.body, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
