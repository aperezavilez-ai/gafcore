/**
 * Bucle agente: generar → validar → reintentar (máx. 2 correcciones).
 */
import type { GafcoreChatMessage } from "@/lib/gafcore-media.shared";
import { completeChatMessage } from "@/lib/gafcore-ai-gateway.server";
import { finalizeGafcoreBuildDelivery } from "@/lib/gafcore-chat-delivery.shared";
import { gateDeliveredFiles } from "@/lib/gafcore-chat-delivery-gate.shared";
import type { ProjFile } from "@/lib/gafcore-chat.shared";
import { enrichGafcoreOutputFiles } from "@/lib/gafcore-media.server";
import { logDev } from "@/lib/gafcore-logger.server";

const MAX_ATTEMPTS = 3;

export type AgentChatRunResult = {
  reply: string;
  files: Array<{ name: string; language?: string; content: string }>;
  attempts: number;
  validationBlocked: boolean;
};

export async function runGafcoreAgentChatCompletion(input: {
  model: string;
  messages: GafcoreChatMessage[];
  instruction: string;
  contextFiles: ProjFile[];
  enrichContext: ProjFile[];
}): Promise<AgentChatRunResult> {
  const workingMessages = [...input.messages];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { content } = await completeChatMessage({
      model: input.model,
      messages: workingMessages,
      json: true,
      temperature: attempt === 1 ? 0.7 : 0.35,
    });

    const { parseJsonLoose } = await import("@/lib/gafcore-json-loose.shared");
    const looseParsed = parseJsonLoose<{ reply?: string; files?: unknown }>(content);
    const parsed = looseParsed ?? { reply: content.slice(0, 500), files: [] };
    const replyRaw = typeof parsed.reply === "string" ? parsed.reply : "Listo.";

    const delivery = finalizeGafcoreBuildDelivery(
      input.instruction,
      input.contextFiles,
      replyRaw,
      parsed.files,
    );

    let safeFiles = delivery.files;
    try {
      safeFiles = await enrichGafcoreOutputFiles(
        safeFiles,
        input.enrichContext,
        input.instruction,
      );
    } catch {
      /* enrich opcional */
    }

    if (safeFiles.length === 0) {
      return {
        reply: replyRaw,
        files: [],
        attempts: attempt,
        validationBlocked: false,
      };
    }

    const gate = gateDeliveredFiles(input.contextFiles, safeFiles, input.instruction);
    if (gate.ok) {
      logDev("gafcore_agent_chat_ok", { attempt, files: safeFiles.length });
      const reply =
        gate.issues.length > 0 && gate.userMessage
          ? `${replyRaw}\n\n${gate.userMessage}`
          : replyRaw;
      return {
        reply,
        files: safeFiles,
        attempts: attempt,
        validationBlocked: false,
      };
    }

    logDev("gafcore_agent_chat_validation_fail", {
      attempt,
      errors: gate.issues.length,
    });

    if (attempt >= MAX_ATTEMPTS) {
      if (safeFiles.length > 0) {
        logDev("gafcore_agent_chat_best_effort", {
          attempt,
          files: safeFiles.length,
          issues: gate.issues.length,
        });
        return {
          reply: gate.userMessage
            ? `${replyRaw}\n\n${gate.userMessage}`
            : replyRaw,
          files: safeFiles,
          attempts: attempt,
          validationBlocked: false,
        };
      }
      return {
        reply: `${replyRaw}\n\nNo se aplicaron cambios: ${gate.userMessage}`,
        files: [],
        attempts: attempt,
        validationBlocked: true,
      };
    }

    workingMessages.push(
      { role: "assistant", content: content.slice(0, 12000) },
      { role: "user", content: gate.fixInstruction },
    );
  }

  return {
    reply: "No se pudo completar la generación.",
    files: [],
    attempts: MAX_ATTEMPTS,
    validationBlocked: true,
  };
}
