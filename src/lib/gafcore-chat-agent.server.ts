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

/**
 * El build de respaldo (createDeterministicBuildFallbackFiles) es una plantilla
 * fija, no salida del modelo — pero antes se entregaba al preview sin pasar
 * por el mismo gate de Babel que el camino normal. Si esa plantilla llegara a
 * tener un error de sintaxis (p. ej. al agregar una variante nueva), el
 * usuario se quedaba viendo "Construcción fallida" sin ningún reintento
 * posible. Ahora se valida igual que la salida real de la IA.
 */
async function fallbackFilesCompile(
  contextFiles: ProjFile[],
  fallbackFiles: Array<{ name: string; content: string }>,
): Promise<boolean> {
  const merged = mergeContextWithDelta(contextFiles, fallbackFiles);
  const transpile = await validateGafcoreProjectCore(
    merged.map((f) => ({ name: f.name, content: f.content })),
  );
  return transpile.ok;
}

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

export type GafcoreAutoCorrectAgentEvent = {
  stage:
    | "inspect"
    | "normalize"
    | "repair"
    | "gate"
    | "transpile"
    | "deliver"
    | "blocked";
  message: string;
  attempt: number;
  issueCount?: number;
};

export type GafcoreAutoCorrectAgentReport = {
  status: "passed" | "repaired" | "blocked";
  attempts: number;
  repaired: boolean;
  issueCount: number;
  events: GafcoreAutoCorrectAgentEvent[];
};

export type AgentChatRunResult = {
  reply: string;
  files: Array<{ name: string; language?: string; content: string }>;
  attempts: number;
  validationBlocked: boolean;
  autoCorrectAgent?: GafcoreAutoCorrectAgentReport;
};

async function tryFallbackBuild(input: {
  instruction: string;
  contextFiles: ProjFile[];
  attempts: number;
}): Promise<AgentChatRunResult | null> {
  if (!isSubstantiveBuildRequest(input.instruction)) return null;
  const fallbackFiles = createDeterministicBuildFallbackFiles(
    input.instruction,
    input.contextFiles,
  );
  const gate = await gateDeliveredFiles(input.contextFiles, fallbackFiles, input.instruction);
  if (!gate.ok) return null;
  if (!(await fallbackFilesCompile(input.contextFiles, gate.files))) {
    logWarn("gafcore_fallback_build_transpile_fail", { instruction: input.instruction.slice(0, 200) });
    return null;
  }
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
  // Streaming: content del intento 1 ya obtenido por SSE (evita re-generar). Los
  // reintentos de corrección (2-3) llaman al modelo normalmente. seedTruncated
  // indica si ese stream cerró por límite de tokens (stop_reason=max_tokens).
  seedFirstContent?: string;
  seedTruncated?: boolean;
  onProgress?: (event: GafcoreAutoCorrectAgentEvent) => void | Promise<void>;
}): Promise<AgentChatRunResult> {
  const workingMessages = [...input.messages];

  const emitAgent = async (
    stage: GafcoreAutoCorrectAgentEvent["stage"],
    message: string,
    attempt: number,
    issueCount?: number,
  ) => {
    const event: GafcoreAutoCorrectAgentEvent = { stage, message, attempt, issueCount };
    await input.onProgress?.(event);
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await emitAgent(
      "inspect",
      attempt === 1
        ? "Agente autocorrector: revisando la respuesta de la IA"
        : `Agente autocorrector: reintento ${attempt} de correccion`,
      attempt,
    );
    let content: string;
    let truncated: boolean;
    if (attempt === 1 && typeof input.seedFirstContent === "string") {
      content = input.seedFirstContent;
      truncated = input.seedTruncated === true;
    } else {
      const res = await completeChatMessage({
        model: input.model,
        messages: workingMessages,
        json: true,
        temperature: attempt === 1 ? 0.7 : 0.35,
        // Builds de proyecto devuelven JSON { reply, files:[...] } que supera el
        // default de 8192 tokens y se cortaba a mitad de archivo (stop_reason=
        // max_tokens), produciendo TSX truncado. 16000 = mismo techo que siteBuilderV2.
        maxTokens: 16000,
      });
      content = res.content;
      truncated = res.truncated;
    }

    // Layer 2: si el modelo cortó por límite de tokens, NO entregamos el JSON
    // parcial (rompería sintaxis). Reintentamos pidiendo una respuesta más
    // compacta; si es el último intento, avisamos en vez de entregar basura.
    if (truncated) {
      logWarn("gafcore_agent_response_truncated", { attempt, contentLen: content.length });
      if (attempt < MAX_ATTEMPTS) {
        await emitAgent(
          "repair",
          "Agente autocorrector: respuesta incompleta, pidiendo una version mas compacta",
          attempt,
        );
        workingMessages.push(
          { role: "assistant", content: content.slice(0, 4000) },
          { role: "user", content: TRUNCATED_RETRY_INSTRUCTION },
        );
        continue;
      }
      return {
        reply:
          "La respuesta superó el límite de tamaño y quedó incompleta. " +
          "Pide el proyecto por partes (p. ej. primero la estructura, luego cada sección) o simplifica el alcance.",
        files: [],
        attempts: attempt,
        validationBlocked: true,
      };
    }

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
    await emitAgent(
      "normalize",
      "Agente autocorrector: normalizando archivos para el workspace",
      attempt,
    );

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
        await emitAgent(
          "repair",
          parseFailed
            ? "Agente autocorrector: JSON invalido, solicitando archivos corregidos"
            : "Agente autocorrector: no llegaron archivos aplicables, solicitando delta completo",
          attempt,
        );
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

    await emitAgent(
      "gate",
      "Agente autocorrector: auditando sintaxis, imports y estructura",
      attempt,
    );
    const gate = await gateDeliveredFiles(input.contextFiles, safeFiles, input.instruction);
    if (gate.ok) {
      const mergedForTranspile = mergeContextWithDelta(input.contextFiles, gate.files);
      await emitAgent(
        "transpile",
        "Agente autocorrector: validando build real antes del preview",
        attempt,
      );
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
        await emitAgent(
          "repair",
          "Agente autocorrector: corrigiendo errores de compilacion",
          attempt,
          syntaxBlocking.length,
        );
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
      await emitAgent(
        "deliver",
        attempt > 1
          ? "Agente autocorrector: archivos reparados y listos para el preview"
          : "Agente autocorrector: archivos validados y listos para el preview",
        attempt,
      );
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

    await emitAgent(
      "repair",
      "Agente autocorrector: aplicando correccion automatica sobre los errores encontrados",
      attempt,
      gate.issues.length,
    );
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
