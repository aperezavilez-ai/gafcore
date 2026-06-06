/**
 * Autopilot de la guía del proyecto: tras describir la idea, avanza pasos 2–6 solos.
 * Pausa si la IA necesita input del usuario o hay un error bloqueante.
 */
import type { GafcoreChatNextStep } from "@/lib/gafcore-chat-suggestions.shared";
import {
  getGafcoreChatNextSteps,
  getRecommendedNextStep,
  hasSubstantiveUserIntent,
  type GafcoreChatSuggestionContext,
} from "@/lib/gafcore-chat-suggestions.shared";

export type GuideAutopilotState = {
  active: boolean;
  paused: boolean;
  pauseReason: string | null;
  lastStepId: string | null;
  /** Pasos auto-enviados en esta sesión de guía. */
  autoStepsRun: number;
};

export const GUIDE_AUTOPILOT_DELAY_MS = 2500;

/** Máximo de pasos automáticos tras un mensaje del usuario (evita 15+ min en cadena). */
export const MAX_GUIDE_AUTOPILOT_CHAIN = 3;

export function shouldUseFastChatPipeline(instruction: string): boolean {
  return /\[GUÍA GAFCORE/i.test(instruction);
}

/** Burbuja corta en el chat (el prompt completo solo va al backend). */
export function formatGuideAutopilotUserBubble(instruction: string): string | null {
  if (!shouldUseFastChatPipeline(instruction)) return null;
  const m = /\[GUÍA GAFCORE — paso (\d+): ([^\]]+)\]/i.exec(instruction);
  return m ? `▶ Guía automática · ${m[2]}` : "▶ Guía automática";
}

const AI_NEEDS_USER_RE =
  /\?(?:\s|$)|¿|necesito que (?:me )?(?:digas|indiques|confirmes|elijas)|ind[ií]came|confirma(?:me)?|cu[aá]l prefieres|qu[eé] (?:color|nombre|texto|logo)|antes de continuar|falta (?:que|informaci)/i;

const BLOCKING_PREVIEW_RE =
  /syntaxerror|unexpected token|react is not defined|already been declared|script error|react error #31|objects are not valid|validation/i;

export function createGuideAutopilotState(): GuideAutopilotState {
  return { active: false, paused: false, pauseReason: null, lastStepId: null, autoStepsRun: 0 };
}

export function shouldEnableGuideAutopilot(ctx: GafcoreChatSuggestionContext): boolean {
  if (ctx.mode !== "build" || ctx.factoryMode || ctx.visualEditOn) return false;
  if (isBlockingPreviewError(ctx.lastError)) return false;
  return hasSubstantiveUserIntent(ctx.messages);
}

export function buildAutopilotInstruction(step: GafcoreChatNextStep): string {
  const label = step.label.replace(/^\d+\.\s*|^⚠\s*/, "");
  return (
    `[GUÍA GAFCORE — paso ${step.order}: ${label}] ` +
    "Continúa construyendo el proyecto según la guía. " +
    `${step.prompt} ` +
    "Responde SOLO JSON { reply, files } con código aplicable al preview. " +
    "Si falta UN dato imprescindible del usuario, pregunta solo eso y no generes archivos hasta tener respuesta."
  );
}

export function aiReplyNeedsUserInput(reply: string): boolean {
  const t = reply.trim();
  if (t.length < 12) return false;
  if (AI_NEEDS_USER_RE.test(t) && t.length < 900) return true;
  const qCount = (t.match(/\?/g) ?? []).length;
  return qCount >= 2 && t.length < 600;
}

export function extractGuidePauseHint(reply: string): string {
  const lines = reply
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const question = lines.find((l) => l.includes("?") || l.includes("¿"));
  if (question) return question.slice(0, 220);
  return "Responde en el chat y pulsa Construir para continuar con el siguiente paso de la guía.";
}

export function isBlockingPreviewError(err: string | null): boolean {
  if (!err?.trim()) return false;
  return BLOCKING_PREVIEW_RE.test(err);
}

export function pickAutopilotStep(
  ctx: GafcoreChatSuggestionContext,
  lastStepId: string | null,
): GafcoreChatNextStep | null {
  const steps = getGafcoreChatNextSteps(ctx);
  const recommended = getRecommendedNextStep(steps);
  if (!recommended) return null;
  if (recommended.status === "completed") return null;
  if (recommended.id === "guide-1") {
    return steps.find((s) => s.id === "guide-2" && s.status !== "completed") ?? null;
  }
  if (recommended.id === lastStepId && recommended.status === "current") {
    const nextUp = steps.find((s) => s.status === "upcoming");
    return nextUp ?? null;
  }
  return recommended;
}

export function allGuideStepsCompleted(ctx: GafcoreChatSuggestionContext): boolean {
  const steps = getGafcoreChatNextSteps(ctx);
  return steps.length > 0 && steps.every((s) => s.status === "completed");
}

export function guideAutopilotStatusMessage(state: GuideAutopilotState): string | null {
  if (!state.active) return null;
  if (state.paused && state.pauseReason) {
    return `Guía en pausa: ${state.pauseReason}`;
  }
  if (state.active && !state.paused) {
    return "Guía automática en curso — los pasos continúan solos tras cada build.";
  }
  return null;
}
