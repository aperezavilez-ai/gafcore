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
  pickModel,
  resolveGafcoreModelDefaults,
  type ProjFile,
} from "@/lib/gafcore-chat.shared";
import { getAiChatConfig, postChatCompletions } from "@/lib/ai-chat-completions.server";
import { isGafcoreAdminUser } from "@/lib/gafcore-admin-role.server";
import { sanitizeUserFacingAiText } from "@/lib/gafcore-user-facing-errors";
import { enrichGafcoreOutputFiles } from "@/lib/gafcore-media.server";
import { extractVisionImageParts } from "@/lib/gafcore-media.shared";

export const gafcoreChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => gafcoreChatBodySchema.parse(input))
  .handler(async ({ data, context }) => {
    const t0 = Date.now();
    let aiCfg: ReturnType<typeof getAiChatConfig>;
    try {
      aiCfg = getAiChatConfig();
    } catch {
      throw new Error("AI no configurado");
    }

    const defaults = resolveGafcoreModelDefaults(aiCfg.url);
    const fast = process.env.AI_MODEL_FAST?.trim() || defaults.fast;
    const deep = process.env.AI_MODEL_DEEP?.trim() || defaults.deep;
    const { messages, model, subset, ctxFiles } = buildGafcoreMessages(
      data,
      pickModel(data.instruction, fast, deep, extractVisionImageParts(data.files as ProjFile[]).length > 0),
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
      return { reply: sanitizeUserFacingAiText(cached.reply), files: cached.files, balance: bal };
    }

    const skipCredits = await isGafcoreAdminUser(context.userId);
    let balanceAfterConsume: number | null = null;
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
      balanceAfterConsume = (credit as { balance?: number } | null)?.balance ?? null;
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
      return {
        reply: sanitizeUserFacingAiText(content),
        files: [],
        balance: balanceAfterConsume,
      };
    }

    let safeFiles = validateOutputFiles(parsed.files);
    try {
      safeFiles = await enrichGafcoreOutputFiles(
        safeFiles,
        data.files as ProjFile[],
        data.instruction,
      );
    } catch (e) {
      console.warn("enrichGafcoreOutputFiles:", e);
    }
    const reply = sanitizeUserFacingAiText(typeof parsed.reply === "string" ? parsed.reply : "Listo.");

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
