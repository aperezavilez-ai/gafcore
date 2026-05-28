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
import { enforceGafcoreChatRateLimit } from "@/lib/gafcore-api-ratelimit.server";
import { assertGafcoreProjectAccess } from "@/lib/gafcore-project-access.server";
import { sanitizeUserFacingAiText } from "@/lib/gafcore-user-facing-errors";
import { enrichGafcoreOutputFiles } from "@/lib/gafcore-media.server";
import {
  extractVisionImageParts,
  patchProjectFilesVisually,
  repairGafcoreOutputFiles,
} from "@/lib/gafcore-media.shared";
import { retrieveProjectMemoryContext } from "@/memory/retrieve.server";
import { shouldBypassGafcoreChatCache, softenRoboticReply } from "@/lib/gafcore-chat-intent.shared";
import { classifyUserIntent } from "@/orchestrator/intent.classifier";
import { selectTemplateSlug } from "@/orchestrator/template.selector";
import { loadTemplateFilesBySlug } from "@/lib/gafcore-templates.server";

const BUILD_INTENT_RE =
  /\b(crea|crear|construye|construir|genera|generar|haz|hacer|monta|levanta|app|aplicaci[oó]n|sitio|web|landing|tienda|e-?commerce|dashboard|saas|proyecto)\b/i;

function shouldBootstrapProjectFromTemplate(
  instruction: string,
  currentFiles: ProjFile[],
  outputFiles: Array<{ name: string; language?: string; content: string }>,
): boolean {
  if (outputFiles.length > 0) return false;
  const text = instruction.trim();
  if (!text) return false;
  if (!BUILD_INTENT_RE.test(text)) return false;
  const appFile = currentFiles.find((f) => /^app\.(jsx?|tsx?)$/i.test(f.name));
  if (!appFile) return true;
  return /Bienvenidos a GafCore|gafcore-logo\.png/i.test(appFile.content);
}

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

    let gateway: ReturnType<typeof getGafcoreAiGateway>;
    try {
      gateway = getGafcoreAiGateway();
    } catch {
      throw new Error("AI no configurado");
    }

    const memory = await retrieveProjectMemoryContext({
      projectId: data.projectId,
      userId,
      instruction: data.instruction,
      files: data.files as ProjFile[],
    });
    const model = resolveGatewayModel(gateway, {
      instruction: data.instruction,
      hasVision: extractVisionImageParts(data.files as ProjFile[]).length > 0,
    });
    const { messages, subset, ctxFiles } = buildGafcoreMessages(
      data,
      model,
      memory.promptAppendix,
      memory.priorityPaths,
    );

    const cacheKey = `${userId}:${model}:${instructionKey(data.instruction)}:${projectCacheFingerprint(data.files as ProjFile[])}`;
    const cached = shouldBypassGafcoreChatCache(data.instruction) ? null : cacheGet(cacheKey);
    if (cached) {
      const bal = await fetchBalance(userId);
      console.info(
        JSON.stringify({
          event: "gafcore_chat",
          cacheHit: true,
          userId,
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
        const insuff: Error & { code?: string } = new Error("INSUFFICIENT_CREDITS");
        insuff.code = "INSUFFICIENT_CREDITS";
        throw insuff;
      }
      throw e;
    }
    const { parseJsonLoose } = await import("@/lib/gafcore-json-loose.shared");
    const looseParsed = parseJsonLoose<{ reply?: string; files?: unknown }>(content);
    let parsed: { reply?: string; files?: unknown };
    if (looseParsed) {
      parsed = looseParsed;
    } else {
      parsed = {};
      console.info(
        JSON.stringify({
          event: "gafcore_chat",
          cacheHit: false,
          userId,
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

    let safeFiles = repairGafcoreOutputFiles(validateOutputFiles(parsed.files));
    if (safeFiles.length === 0) {
      const localPatch = patchProjectFilesVisually(data.files as ProjFile[], data.instruction);
      if (localPatch.length > 0) safeFiles = repairGafcoreOutputFiles(localPatch);
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
    if (shouldBootstrapProjectFromTemplate(data.instruction, data.files as ProjFile[], safeFiles)) {
      try {
        const intent = classifyUserIntent(data.instruction, {
          mode: "build",
          visualEdit: false,
        });
        const templateSlug = selectTemplateSlug(intent);
        const templateFiles = await loadTemplateFilesBySlug(templateSlug, userId);
        if (templateFiles.length > 0) {
          safeFiles = repairGafcoreOutputFiles(templateFiles);
          console.info(
            JSON.stringify({
              event: "gafcore_chat_bootstrap_template",
              userId,
              templateSlug,
              filesOut: safeFiles.length,
            }),
          );
        }
      } catch (e) {
        console.warn("bootstrap_template_fallback:", e);
      }
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
        userId,
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
