// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
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
  MODEL_FAST,
  MODEL_DEEP,
  pickModel,
  type ProjFile,
} from "@/lib/gafcore-chat.shared";
import { getAiChatConfig, postChatCompletions } from "@/lib/ai-chat-completions.server";
import { isGafcoreAdminUser } from "@/lib/gafcore-admin-role.server";

export const gafcoreChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => gafcoreChatBodySchema.parse(input))
  .handler(async ({ data, context }) => {
    const t0 = Date.now();
    try {
      getAiChatConfig();
    } catch {
      throw new Error("AI no configurado");
    }

    const fast = process.env.AI_MODEL_FAST ?? MODEL_FAST;
    const deep = process.env.AI_MODEL_DEEP ?? MODEL_DEEP;
    const { messages, model, subset, ctxFiles } = buildGafcoreMessages(
      data,
      pickModel(data.instruction, fast, deep),
    );

    const cacheKey = `${context.userId}:${model}:${instructionKey(data.instruction)}:${projectCacheFingerprint(data.files as ProjFile[])}`;
    const cached = cacheGet(cacheKey);
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
      return { reply: cached.reply, files: cached.files, balance: bal };
    }

    const skipCredits = await isGafcoreAdminUser(context.userId);
    if (!skipCredits) {
      const { data: credit, error: creditErr } = await supabaseAdmin.rpc("consume_credits", {
        p_user_id: context.userId,
        p_amount: COST_PER_REQUEST,
        p_reason: "gafcore_chat",
        p_metadata: {
          instruction_len: data.instruction.length,
          model,
          ctx_files: ctxFiles.length,
          subset,
        } as never,
      });
      if (creditErr) {
        console.error("consume_credits error:", creditErr);
        throw new Error("No se pudo verificar tu saldo de créditos.");
      }
      if (!(credit as { ok?: boolean } | null)?.ok) {
        const err: Error & { code?: string } = new Error("INSUFFICIENT_CREDITS");
        err.code = "INSUFFICIENT_CREDITS";
        throw err;
      }
    }

    const res = await postChatCompletions({
      model,
      messages,
      response_format: { type: "json_object" },
    });

    if (!res.ok) {
      if (!skipCredits) {
        await supabaseAdmin.rpc("add_credits", {
          p_user_id: context.userId,
          p_amount: COST_PER_REQUEST,
          p_reason: "gafcore_chat_refund",
          p_metadata: { status: res.status } as never,
        });
      }
      const t = await res.text().catch(() => "");
      console.error("AI gateway error:", res.status, t);
      if (res.status === 429) throw new Error("Límite alcanzado, intenta en un momento.");
      if (res.status === 402) {
        const err: any = new Error("INSUFFICIENT_CREDITS");
        err.code = "INSUFFICIENT_CREDITS";
        throw err;
      }
      throw new Error("No se pudo obtener respuesta del asistente.");
    }

    const json = await res.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "{}";
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
      return { reply: content, files: [], balance: (credit as any)?.balance };
    }

    const safeFiles = validateOutputFiles(parsed.files);
    const reply = typeof parsed.reply === "string" ? parsed.reply : "Listo.";

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
      balance: (credit as any)?.balance,
    };
  });
