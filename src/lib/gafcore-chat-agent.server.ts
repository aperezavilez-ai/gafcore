/**
 * Bucle agente: generar → validar → reintentar (máx. 3 correcciones).
 */
import type { GafcoreChatMessage } from "@/lib/gafcore-media.shared";
import { completeChatMessage } from "@/lib/gafcore-ai-gateway.server";
import { finalizeGafcoreBuildDelivery } from "@/lib/gafcore-chat-delivery.shared";
import { gateDeliveredFiles } from "@/lib/gafcore-chat-delivery-gate.shared";
import type { ProjFile } from "@/lib/gafcore-chat.shared";
import { isSubstantiveBuildRequest } from "@/lib/gafcore-chat-intent.shared";
import { enrichGafcoreOutputFiles } from "@/lib/gafcore-media.server";
import { logDev } from "@/lib/gafcore-logger.server";
import { healWorkspaceSyntax } from "@/core/pipeline/syntax-heal.shared";

const MAX_ATTEMPTS = 3;

const JSON_RETRY_INSTRUCTION =
  'Tu respuesta no fue JSON válido con archivos. Responde SOLO JSON { "reply": "...", "files": [...] } ' +
  "con el contenido COMPLETO de cada archivo modificado. Sin markdown ni texto fuera del JSON.";

const EMPTY_FILES_RETRY_INSTRUCTION =
  "No se recibieron archivos aplicables. Responde SOLO JSON con files no vacío. " +
  "Incluye App.tsx (export default function App) con código completo y funcional.";

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
    const parseFailed = looseParsed === null;
    if (parseFailed) {
      logDev("gafcore_agent_json_parse_fail", {
        attempt,
        contentLen: content.length,
        hasFilesKey: /"files"\s*:/.test(content),
        preview: content.slice(0, 240),
      });
    }
    const parsed = looseParsed ?? { reply: content.slice(0, 500), files: [] };
    const replyRaw = typeof parsed.reply === "string" ? parsed.reply : "Listo.";
    const rawFilesCount = Array.isArray(parsed.files) ? parsed.files.length : 0;

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
      const buildRequest = isSubstantiveBuildRequest(input.instruction);
      const expectedFiles =
        buildRequest && (parseFailed || rawFilesCount > 0 || /"files"\s*:/.test(content));

      if (expectedFiles && attempt < MAX_ATTEMPTS) {
        logDev("gafcore_agent_empty_delivery_retry", {
          attempt,
          parseFailed,
          rawFilesCount,
          deliverySource: delivery.source,
        });
        workingMessages.push(
          { role: "assistant", content: content.slice(0, 12000) },
          {
            role: "user",
            content: parseFailed ? JSON_RETRY_INSTRUCTION : EMPTY_FILES_RETRY_INSTRUCTION,
          },
        );
        continue;
      }

      if (expectedFiles) {
        logDev("gafcore_agent_empty_delivery", {
          attempt,
          parseFailed,
          rawFilesCount,
          deliverySource: delivery.source,
        });
        const reason = parseFailed
          ? "la respuesta de la IA no era JSON válido con archivos"
          : rawFilesCount > 0
            ? "los archivos devueltos no pasaron la validación inicial"
            : "no se recibieron archivos aplicables al proyecto";
        return {
          reply: `${replyRaw}\n\nNo se aplicaron cambios: ${reason}. Inténtalo de nuevo.`,
          files: [],
          attempts: attempt,
          validationBlocked: true,
        };
      }

      return {
        reply: replyRaw,
        files: [],
        attempts: attempt,
        validationBlocked: false,
      };
    }

    const gate = gateDeliveredFiles(input.contextFiles, safeFiles, input.instruction);
    if (gate.ok) {
      logDev("gafcore_agent_chat_ok", { attempt, files: gate.files.length });
      return {
        reply: replyRaw,
        files: gate.files,
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
        const healed = healWorkspaceSyntax(safeFiles);
        logDev("gafcore_agent_chat_best_effort", {
          attempt,
          files: healed.files.length,
          issues: gate.issues.length,
          syntaxHealed: healed.healed,
        });
        return {
          reply: replyRaw,
          files: healed.files,
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
