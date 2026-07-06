/**
 * Bucle agente: generar → validar → reintentar (máx. 3 correcciones).
 * 3 intentos = 1 generación + 2 rondas de auto-corrección. Una página
 * completa suele necesitar 2 correcciones de sintaxis/JSX; con solo 2
 * intentos el gate bloqueaba la entrega ("No se aplicaron cambios").
 * Caso realista: 3 × timeout por llamada (~60 s) ≈ 180 s, bajo el
 * maxDuration=300 s de Vercel. El caso degenerado (reintentos de red por
 * 5xx en cada intento) queda acotado por ese maxDuration.
 * Ver nota de timeouts en `ai-chat-completions.server.ts`.
 */
import type { GafcoreChatMessage } from "@/lib/gafcore-media.shared";
import { completeChatMessage } from "@/lib/gafcore-ai-gateway.server";
import {
  createDeterministicBuildFallbackFiles,
  finalizeGafcoreBuildDelivery,
} from "@/lib/gafcore-chat-delivery.shared";
import { gateDeliveredFiles } from "@/lib/gafcore-chat-delivery-gate.shared";
import type { ProjFile } from "@/lib/gafcore-chat.shared";
import { buildValidationFixInstruction } from "@/lib/gafcore-ai-validation.shared";
import { mergeContextWithDelta } from "@/lib/gafcore-brain-agent.shared";
import { isSubstantiveBuildRequest, isReviewAnalysisInstruction } from "@/lib/gafcore-chat-intent.shared";
import { enrichGafcoreOutputFiles } from "@/lib/gafcore-media.server";
import { logDev, logWarn } from "@/lib/gafcore-logger.server";
import { validateGafcoreProjectCore } from "@/lib/gafcore-validate.server";

const MAX_ATTEMPTS = 3;

const JSON_RETRY_INSTRUCTION =
  'Tu respuesta no fue JSON válido con archivos. Responde SOLO JSON { "reply": "...", "files": [...] } ' +
  "con el contenido COMPLETO de cada archivo modificado. Sin markdown ni texto fuera del JSON.";

const EMPTY_FILES_RETRY_INSTRUCTION =
  "No se recibieron archivos aplicables. Responde SOLO JSON con files no vacío. " +
  "Incluye App.tsx (export default function App) con código completo y funcional.";

/**
 * INSTRUMENTACIÓN TEMPORAL (diagnóstico bloqueo de validación).
 * Emite con logWarn (visible en prod) el código generado + issues exactos
 * cuando el agente bloquea. Quitar tras capturar evidencia.
 */
function logBlockDiagnostic(
  stage: string,
  attempt: number,
  instruction: string,
  files: Array<{ name: string; content: string }>,
  issues: Array<{ severity: string; category?: string; file: string; message: string }>,
): void {
  logWarn("gafcore_block_diag", {
    stage,
    attempt,
    instruction: instruction.slice(0, 300),
    issues: issues.slice(0, 12).map((i) => `[${i.severity}/${i.category ?? "?"}] ${i.file}: ${i.message}`),
    files: files.map((f) => ({
      name: f.name,
      len: f.content.length,
      hasUseState: /\buseState\b/.test(f.content),
      // Recortes acotados para no exceder límites de log (inicio + fin del archivo).
      head: f.content.slice(0, 1500),
      tail: f.content.length > 1500 ? f.content.slice(-700) : "",
    })),
  });
}

export type AgentChatRunResult = {
  reply: string;
  files: Array<{ name: string; language?: string; content: string }>;
  attempts: number;
  validationBlocked: boolean;
};

async function tryFallbackBuild(input: {
  instruction: string;
  contextFiles: ProjFile[];
  attempts: number;
}): Promise<AgentChatRunResult | null> {
  if (!isSubstantiveBuildRequest(input.instruction)) return null;
  const fallbackFiles = createDeterministicBuildFallbackFiles(input.instruction);
  const gate = await gateDeliveredFiles(input.contextFiles, fallbackFiles, input.instruction);
  if (!gate.ok) return null;
  return {
    reply:
      "Construi una base funcional para tu pedido. La IA principal devolvio codigo invalido, asi que aplique un build seguro para que el preview no se quede sin cambios.",
    files: gate.files,
    attempts: input.attempts,
    validationBlocked: false,
  };
}

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
      if (isReviewAnalysisInstruction(input.instruction)) {
        return {
          reply: replyRaw,
          files: [],
          attempts: attempt,
          validationBlocked: false,
        };
      }

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
        logBlockDiagnostic(
          "empty_delivery",
          attempt,
          input.instruction,
          [{ name: "__raw_ai_content__", content: content }],
          [{ severity: "error", category: "build", file: "-", message: `parseFailed=${parseFailed} rawFilesCount=${rawFilesCount} source=${delivery.source}` }],
        );
        const fallback = await tryFallbackBuild({
          instruction: input.instruction,
          contextFiles: input.contextFiles,
          attempts: attempt,
        });
        if (fallback) return fallback;
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

    const gate = await gateDeliveredFiles(input.contextFiles, safeFiles, input.instruction);
    if (gate.ok) {
      const mergedForTranspile = mergeContextWithDelta(input.contextFiles, gate.files);
      const transpile = await validateGafcoreProjectCore(
        mergedForTranspile.map((f) => ({ name: f.name, content: f.content })),
      );
      if (!transpile.ok) {
        const syntaxBlocking = transpile.issues.filter((i) => i.severity === "error");
        logDev("gafcore_agent_transpile_fail", {
          attempt,
          errors: syntaxBlocking.length,
        });
        if (attempt >= MAX_ATTEMPTS) {
          logBlockDiagnostic(
            "transpile_fail",
            attempt,
            input.instruction,
            mergedForTranspile.map((f) => ({ name: f.name, content: f.content })),
            syntaxBlocking,
          );
          const fallback = await tryFallbackBuild({
            instruction: input.instruction,
            contextFiles: input.contextFiles,
            attempts: attempt,
          });
          if (fallback) return fallback;
          return {
            reply: `${replyRaw}\n\nNo se aplicaron cambios: el código no compila.`,
            files: [],
            attempts: attempt,
            validationBlocked: true,
          };
        }
        workingMessages.push(
          { role: "assistant", content: content.slice(0, 12000) },
          {
            role: "user",
            content: buildValidationFixInstruction(syntaxBlocking, input.instruction),
          },
        );
        continue;
      }

      logDev("gafcore_agent_chat_ok", { attempt, files: gate.files.length });
      if (isReviewAnalysisInstruction(input.instruction)) {
        return {
          reply: replyRaw,
          files: [],
          attempts: attempt,
          validationBlocked: false,
        };
      }
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
      logBlockDiagnostic(
        "gate_fail",
        attempt,
        input.instruction,
        safeFiles.map((f) => ({ name: f.name, content: f.content })),
        gate.issues,
      );
      const fallback = await tryFallbackBuild({
        instruction: input.instruction,
        contextFiles: input.contextFiles,
        attempts: attempt,
      });
      if (fallback) return fallback;
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

  const fallback = await tryFallbackBuild({
    instruction: input.instruction,
    contextFiles: input.contextFiles,
    attempts: MAX_ATTEMPTS,
  });
  if (fallback) return fallback;

  return {
    reply: "No se pudo completar la generación.",
    files: [],
    attempts: MAX_ATTEMPTS,
    validationBlocked: true,
  };
}
