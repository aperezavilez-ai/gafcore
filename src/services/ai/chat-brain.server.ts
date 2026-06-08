/**
 * Cerebro unificado en el chat: modelos (deep/fast) + motor de diseño.
 */
import type { GafcoreAiGateway } from "@/lib/gafcore-ai-gateway.server";
import { isFastWelcomeBuildInstruction } from "@/lib/gafcore-fast-build.shared";
import { isSubstantiveBuildRequest } from "@/lib/gafcore-chat-intent.shared";
import { inferAiBrainTaskFromInstruction } from "@/services/ai/design-engine.shared";
import { resolveBrainRoute } from "@/services/ai/aiOrchestrator.server";
import type { AiBrainTaskKind } from "@/services/ai/types.shared";

export function isDeepModeInstruction(instruction: string): boolean {
  return /\[modo profundo\]/i.test(instruction);
}

export function inferChatBrainTask(instruction: string): AiBrainTaskKind {
  return (
    inferAiBrainTaskFromInstruction(instruction) ??
    (isSubstantiveBuildRequest(instruction) ? "code" : "chat")
  );
}

/**
 * Modo profundo → Claude / GPT-4o (deep) o Gemini Pro (UI) para lógica y diseño complejo.
 * Modo rápido → Gemini Flash (fast) en chat ligero.
 */
export function resolveModelForGafcoreChat(
  gateway: GafcoreAiGateway,
  instruction: string,
  opts: { hasVision?: boolean; deepMode?: boolean } = {},
): { model: string; task: AiBrainTaskKind; deep: boolean } {
  if (isFastWelcomeBuildInstruction(instruction)) {
    return { model: gateway.models.fast, task: "code", deep: false };
  }
  const deep = opts.deepMode ?? isDeepModeInstruction(instruction);
  const task = inferChatBrainTask(instruction);

  if (deep) {
    if (task === "design" || task === "frontend") {
      return { model: gateway.models.ui, task, deep: true };
    }
    if (task === "fix" || task === "code" || task === "deploy") {
      return { model: gateway.models.deep, task, deep: true };
    }
    return { model: gateway.models.deep, task, deep: true };
  }

  if (task === "design" || task === "frontend") {
    return { model: gateway.models.ui, task, deep: false };
  }

  if (task === "chat" && !isSubstantiveBuildRequest(instruction)) {
    return { model: gateway.models.fast, task, deep: false };
  }

  const route = resolveBrainRoute({ task, instruction, hasVision: opts.hasVision });
  return { model: route.model, task, deep: false };
}

/** Modelo para reparación Safe-Build (diagnóstico profundo). */
export function resolveSafeBuildRepairModel(gateway: GafcoreAiGateway, deepMode: boolean): string {
  if (deepMode) return gateway.models.deep;
  return gateway.models.fast;
}
