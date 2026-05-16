import { createFileRoute } from "@tanstack/react-router";
import { requireUser } from "@/routes/api/elevenlabs/-_auth";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  gafcoreChatBodySchema,
  buildGafcoreMessages,
  cacheGet,
  fetchBalance,
  instructionKey,
  projectCacheFingerprint,
  COST_PER_REQUEST,
  pickModel,
  resolveGafcoreModelDefaults,
  type ProjFile,
} from "@/lib/gafcore-chat.shared";
import { getAiChatConfig, postChatCompletions } from "@/lib/ai-chat-completions.server";
import { isGafcoreAdminUser } from "@/lib/gafcore-admin-role.server";

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

        let aiCfg: ReturnType<typeof getAiChatConfig>;
        try {
          aiCfg = getAiChatConfig();
        } catch {
          return new Response(JSON.stringify({ error: "ai_not_configured" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const defaults = resolveGafcoreModelDefaults(aiCfg.url);
        const fast = process.env.AI_MODEL_FAST?.trim() || defaults.fast;
        const deep = process.env.AI_MODEL_DEEP?.trim() || defaults.deep;
        const { messages, model, subset, ctxFiles } = buildGafcoreMessages(
          data,
          pickModel(
            data.instruction,
            fast,
            deep,
            data.files.some((f) => f.content.trim().startsWith("data:image/")),
          ),
        );
        const cacheKey = `${userId}:${model}:${instructionKey(data.instruction)}:${projectCacheFingerprint(data.files as ProjFile[])}`;
        const cached = cacheGet(cacheKey);
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
          const { data: credit, error: creditErr } = await supabaseAdmin.rpc("consume_credits", {
            p_user_id: userId,
            p_amount: COST_PER_REQUEST,
            p_reason: "gafcore_chat_stream",
            p_metadata: {
              instruction_len: data.instruction.length,
              model,
              ctx_files: ctxFiles.length,
              subset,
            } as never,
          });
          if (creditErr) {
            return new Response(JSON.stringify({ error: "credits_error" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }
          if (!(credit as { ok?: boolean } | null)?.ok) {
            return new Response(JSON.stringify({ error: "insufficient_credits" }), {
              status: 402,
              headers: { "Content-Type": "application/json" },
            });
          }
        }

        const upstream = await postChatCompletions({
          model,
          messages,
          stream: true,
          response_format: { type: "json_object" },
        });

        if (!upstream.ok) {
          if (!skipCredits) {
            await supabaseAdmin.rpc("add_credits", {
              p_user_id: userId,
              p_amount: COST_PER_REQUEST,
              p_reason: "gafcore_chat_stream_refund",
              p_metadata: { status: upstream.status } as never,
            });
          }
          const t = await upstream.text().catch(() => "");
          return new Response(JSON.stringify({ error: "upstream", detail: t.slice(0, 400) }), {
            status: upstream.status >= 400 ? upstream.status : 502,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (!upstream.body) {
          if (!skipCredits) {
            await supabaseAdmin.rpc("add_credits", {
              p_user_id: userId,
              p_amount: COST_PER_REQUEST,
              p_reason: "gafcore_chat_stream_refund",
              p_metadata: { reason: "no_body" } as never,
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
