/**
 * Cerebro Central — exportaciones servidor.
 * Uso: `import { resolveBrainRoute } from "@/services/ai"`
 */
export type {
  AiBrainTaskKind,
  AiBrainProviderId,
  AiBrainRequest,
  AiBrainRoute,
  AiBrainCapabilities,
  AiProviderStatus,
} from "@/services/ai/types.shared";

export {
  resolveBrainRoute,
  getBrainCapabilities,
  listBrainProviderStatuses,
  tryGetBrainGateway,
  enrichPromptWithDesignMotor,
  resolveBrainPromptPackage,
} from "@/services/ai/aiOrchestrator.server";

export {
  BASE_DESIGN_SYSTEM,
  NO_BASIC_CODE_RULE,
  FULL_DESIGN_MOTOR_PROMPT,
  DESIGN_MOTOR_HEADER,
} from "@/services/ai/systemPrompts";

export {
  buildDesignMotorPromptAppend,
  inferAiBrainTaskFromInstruction,
  isDesignMotorTask,
} from "@/services/ai/design-engine.shared";

export { runSafeBuildQualityLoop } from "@/services/ai/safe-build.server";
export {
  resolveModelForGafcoreChat,
  isDeepModeInstruction,
} from "@/services/ai/chat-brain.server";

export * from "@/services/ai/providers/index.server";
