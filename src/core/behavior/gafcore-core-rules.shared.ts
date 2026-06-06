/**
 * Reglas permanentes del core GafCore (Prompt 8 — comportamiento obligatorio).
 * Gates ejecutables: analizar antes de generar, confirmación, failsafe.
 */
import { classifyUserIntent } from "@/orchestrator/intent.classifier";
import { isSubstantiveBuildRequest } from "@/lib/gafcore-chat-intent.shared";
import { shouldUseFastChatPipeline } from "@/lib/gafcore-guide-autopilot.shared";

export type CoreOrchestrationGateInput = {
  instruction: string;
  rawUserText: string;
  mode: "build" | "chat";
  factoryMode: boolean;
  multiAgentMode: boolean;
  visualEditOn: boolean;
  /** Usuario ya confirmó construcción para este pedido. */
  buildConfirmed: boolean;
  /** Hay error activo de preview o validación bloqueante. */
  blockingError: string | null;
  validationBlocked: boolean;
};

export type CoreOrchestrationGateResult = {
  /** Regla #1: mostrar análisis local antes de llamar a la IA generadora. */
  requiresAnalysisBeforeBuild: boolean;
  /** Regla #5: pedir confirmación explícita antes del primer build. */
  requiresBuildConfirmation: boolean;
  /** Regla #13: no auto-avanzar guía/workflow. */
  blockAutonomousAdvance: boolean;
  blockReason: string | null;
};

const FIX_OR_CONTINUE_RE =
  /^(s[ií]|ok|vale|continua|continúa|adelante|corrige|arregla|fix|repara|aplica|siguiente)\b/i;

/** Mensajes de guía automática o confirmación interna — sin segundo gate. */
export function isInternalOrchestrationInstruction(text: string): boolean {
  const t = text.trim();
  return (
    shouldUseFastChatPipeline(t) ||
    /^\[GAFCORE_BUILD_CONFIRMED\]/i.test(t) ||
    /^\[PROYECTO NUEVO GafCore\]/i.test(t) ||
    /^\[FUNCTIONAL-FIRST\]/i.test(t)
  );
}

export function evaluateCoreOrchestrationGate(
  input: CoreOrchestrationGateInput,
): CoreOrchestrationGateResult {
  const intent = classifyUserIntent(input.rawUserText, {
    mode: input.mode,
    visualEdit: input.visualEditOn,
  });

  const substantive =
    input.mode === "build" &&
    isSubstantiveBuildRequest(input.rawUserText) &&
    input.rawUserText.trim().length >= 12;

  const skipGate =
    input.factoryMode ||
    input.multiAgentMode ||
    input.visualEditOn ||
    input.mode !== "build" ||
    input.buildConfirmed ||
    isInternalOrchestrationInstruction(input.rawUserText) ||
    intent.kind === "fix" ||
    intent.kind === "chat" ||
    FIX_OR_CONTINUE_RE.test(input.rawUserText.trim());

  const blockingError = (input.blockingError ?? "").trim();
  const blockAutonomousAdvance =
    input.validationBlocked ||
    Boolean(blockingError) ||
    /syntaxerror|unexpected token|react error|script error|validation/i.test(blockingError);

  if (skipGate) {
    return {
      requiresAnalysisBeforeBuild: false,
      requiresBuildConfirmation: false,
      blockAutonomousAdvance,
      blockReason: blockAutonomousAdvance
        ? "Hay un error activo. Corrige o restaura una versión antes de continuar."
        : null,
    };
  }

  return {
    requiresAnalysisBeforeBuild: substantive,
    requiresBuildConfirmation: substantive,
    blockAutonomousAdvance,
    blockReason: blockAutonomousAdvance
      ? "Hay un error activo. Corrige o restaura una versión antes de continuar."
      : null,
  };
}

/** Prefijo interno tras confirmación del usuario (Regla #5). */
export const GAFCORE_BUILD_CONFIRMED_PREFIX = "[GAFCORE_BUILD_CONFIRMED] ";

export function markBuildConfirmedInstruction(userText: string): string {
  const t = userText.trim();
  if (t.startsWith(GAFCORE_BUILD_CONFIRMED_PREFIX.trim())) return t;
  return `${GAFCORE_BUILD_CONFIRMED_PREFIX}${t}`;
}
