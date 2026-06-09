/**
 * Reglas permanentes del core GafCore (Prompt 8 — comportamiento obligatorio).
 * Gates ejecutables: failsafe ante errores bloqueantes.
 */
import { shouldUseFastChatPipeline } from "@/lib/gafcore-guide-autopilot.shared";
import { isFastWelcomeBuildInstruction } from "@/lib/gafcore-fast-build.shared";
import { GAFCORE_WORKFLOW_STEP_PREFIX } from "@/core/orchestration/workflow-panel.shared";

export type CoreOrchestrationGateInput = {
  /** Hay error activo de preview o validación bloqueante. */
  blockingError: string | null;
  validationBlocked: boolean;
};

export type CoreOrchestrationGateResult = {
  /** Regla #13: no auto-avanzar guía/workflow. */
  blockAutonomousAdvance: boolean;
  blockReason: string | null;
};

/** Mensajes de guía automática o confirmación interna — sin segundo gate. */
export function isInternalOrchestrationInstruction(text: string): boolean {
  const t = text.trim();
  return (
    shouldUseFastChatPipeline(t) ||
    t.includes(GAFCORE_WORKFLOW_STEP_PREFIX) ||
    /^\[PROYECTO NUEVO GafCore\]/i.test(t) ||
    /^\[FUNCTIONAL-FIRST\]/i.test(t) ||
    isFastWelcomeBuildInstruction(t)
  );
}

export function evaluateCoreOrchestrationGate(
  input: CoreOrchestrationGateInput,
): CoreOrchestrationGateResult {
  const blockingError = (input.blockingError ?? "").trim();
  const blockAutonomousAdvance =
    input.validationBlocked ||
    Boolean(blockingError) ||
    /syntaxerror|unexpected token|react error|script error|validation/i.test(blockingError);

  return {
    blockAutonomousAdvance,
    blockReason: blockAutonomousAdvance
      ? "Hay un error activo. Corrige o restaura una versión antes de continuar."
      : null,
  };
}
