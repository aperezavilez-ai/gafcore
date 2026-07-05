/**
 * Cerebro Central GafCore — punto único de entrada para enrutar IA por tarea.
 * Delega la ejecución al gateway existente (`gafcore-ai-gateway`, `ai-chat-completions`).
 */
import { detectModelFamily, type ResolvedProvider } from "@/lib/gafcore-model-routing.shared";
import { resolveAiRoute } from "@/lib/gafcore-model-routing.server";
import {
  getGafcoreAiGateway,
  resolveGatewayModel,
  tryGetGafcoreAiGateway,
} from "@/lib/gafcore-ai-gateway.server";
import { getOpenAiProviderStatus } from "@/services/ai/providers/openai.provider.server";
import { getGeminiProviderStatus } from "@/services/ai/providers/gemini.provider.server";
import { getAnthropicProviderStatus } from "@/services/ai/providers/anthropic.provider.server";
import { getElevenLabsProviderStatus } from "@/services/ai/providers/elevenlabs.provider.server";
import {
  buildDesignMotorPromptAppend,
  inferAiBrainTaskFromInstruction,
  isDesignMotorTask,
} from "@/services/ai/design-engine.shared";
import type {
  AiBrainCapabilities,
  AiBrainProviderId,
  AiBrainRequest,
  AiBrainRoute,
  AiBrainTaskKind,
} from "@/services/ai/types.shared";

function mapResolvedProvider(p: ResolvedProvider): AiBrainProviderId {
  if (p === "openrouter") return "openrouter";
  if (p === "openai") return "openai";
  if (p === "anthropic") return "anthropic";
  if (p === "gptpro4all") return "gptpro4all";
  return "custom";
}

function hasEnv(key: string): boolean {
  const v = process.env[key];
  return typeof v === "string" && v.trim().length > 0;
}

function getGptpro4AllProviderStatus() {
  const explicit = hasEnv("GPTPRO4ALL_API_KEY");
  const viaCustom =
    hasEnv("AI_API_KEY") &&
    Boolean(
      hasEnv("GPTPRO4ALL_BASE_URL") ||
        process.env.AI_CHAT_COMPLETIONS_URL?.toLowerCase().includes("api.chatgptpro4all.com"),
    );
  return {
    id: "gptpro4all" as const,
    configured: explicit || viaCustom,
    envKeys: explicit
      ? ["GPTPRO4ALL_API_KEY"]
      : viaCustom
        ? ["AI_CHAT_COMPLETIONS_URL", "AI_API_KEY"]
        : ["GPTPRO4ALL_API_KEY", "GPTPRO4ALL_BASE_URL"],
  };
}

function inferProviderFromModel(model: string): AiBrainProviderId {
  const family = detectModelFamily(model);
  if (family === "gemini") return "gemini";
  if (family === "claude") return "anthropic";
  if (family === "openai") return "openai";
  return mapResolvedProvider(resolveAiRoute(model).provider);
}

/**
 * Switch principal: elige modelo y proveedor según tipo de tarea.
 * No sustituye aún las rutas `/api/gafcore/chat/*` — andamiaje para migración gradual.
 */
export function resolveBrainRoute(request: AiBrainRequest): AiBrainRoute {
  const { task } = request;

  if (task === "voice") {
    const el = getElevenLabsProviderStatus();
    return {
      task,
      model: "",
      provider: "elevenlabs",
      tier: "fast",
      usesChatCompletions: false,
      note: el.configured
        ? "Usa API ElevenLabs (/api/elevenlabs), no chat completions."
        : "Falta ELEVENLABS_API_KEY.",
    };
  }

  let gateway;
  try {
    gateway = getGafcoreAiGateway();
  } catch {
    return {
      task,
      model: "",
      provider: "openai",
      tier: "fast",
      usesChatCompletions: false,
      note: "IA no configurada.",
    };
  }

  const instruction = request.instruction ?? "";
  let tier: AiBrainRoute["tier"] = "fast";

  switch (task) {
    case "code":
    case "fix":
    case "deploy":
      tier = "deep";
      break;
    case "design":
    case "frontend":
      tier = "ui";
      break;
    case "support":
      tier = "support";
      break;
    case "chat":
    default:
      tier = "fast";
      break;
  }

  let model: string;
  if (request.modelOverride?.trim()) {
    model = request.modelOverride.trim();
  } else if (task === "design" || task === "frontend") {
    model = gateway.models.ui;
  } else if (task === "code" || task === "fix" || task === "deploy") {
    model = gateway.models.deep;
  } else if (task === "support") {
    model = gateway.models.support;
  } else if (instruction) {
    model = resolveGatewayModel(gateway, {
      instruction,
      hasVision: request.hasVision,
    });
    tier = model === gateway.models.ui ? "ui" : model === gateway.models.deep ? "deep" : "fast";
  } else {
    model = gateway.models.fast;
  }

  const provider = inferProviderFromModel(model);

  return {
    task,
    model,
    provider,
    tier,
    usesChatCompletions: true,
  };
}

export function listBrainProviderStatuses() {
  return [
    getGptpro4AllProviderStatus(),
    getOpenAiProviderStatus(),
    getGeminiProviderStatus(),
    getAnthropicProviderStatus(),
    getElevenLabsProviderStatus(),
  ];
}

export function getBrainCapabilities(instruction = ""): AiBrainCapabilities {
  const providers = listBrainProviderStatuses();
  const aiReady = providers.some(
    (p) => p.id !== "elevenlabs" && p.configured,
  );

  const tasks: AiBrainTaskKind[] = [
    "code",
    "design",
    "frontend",
    "chat",
    "voice",
    "support",
    "fix",
    "deploy",
  ];
  const routesByTask = {} as AiBrainCapabilities["routesByTask"];
  for (const task of tasks) {
    const route = resolveBrainRoute({ task, instruction });
    routesByTask[task] = { model: route.model, provider: route.provider };
  }

  return { aiReady, providers, routesByTask };
}

export function tryGetBrainGateway() {
  return tryGetGafcoreAiGateway();
}

/**
 * Inyecta el Motor de Diseño (BASE_DESIGN_SYSTEM + regla no-básico + blueprint)
 * cuando la tarea es \`design\` o \`frontend\`.
 */
export function enrichPromptWithDesignMotor(
  basePrompt: string,
  request: Pick<AiBrainRequest, "task" | "instruction">,
): string {
  const task =
    request.task === "design" || request.task === "frontend"
      ? request.task
      : inferAiBrainTaskFromInstruction(request.instruction ?? "");
  const append = buildDesignMotorPromptAppend(task, request.instruction);
  if (!append.trim()) return basePrompt;
  return `${basePrompt}${append}`;
}

/** Resuelve ruta + bloque de system prompt para envío a OpenAI/Claude/Gemini. */
export function resolveBrainPromptPackage(request: AiBrainRequest): {
  route: AiBrainRoute;
  systemPromptAppend: string;
  usesDesignMotor: boolean;
} {
  const route = resolveBrainRoute(request);
  const effectiveTask =
    isDesignMotorTask(request.task) ? request.task : inferAiBrainTaskFromInstruction(request.instruction ?? "");
  const systemPromptAppend = buildDesignMotorPromptAppend(effectiveTask, request.instruction);
  return {
    route,
    systemPromptAppend,
    usesDesignMotor: systemPromptAppend.length > 0,
  };
}

/**
 * Snapshot + reglas de preservación antes de cada edición con IA.
 * Usar en buildGafcoreMessages y tras parsear la respuesta (applyIncrementalEditPersistence).
 */
export {
  prepareIncrementalEditSession,
  applyIncrementalEditPersistence,
  createCodeSnapshot,
  GAFCORE_STRUCTURE_PRESERVATION_RULE,
  type GafcoreCodeSnapshot,
  type IncrementalEditSession,
} from "@/lib/gafcore-incremental-edit.shared";

/** Escudo de Integridad — reglas de hierro + análisis de impacto + sanación pre-preview. */
export {
  runIntegrityShield,
  analyzeEditImpact,
  auditSyntaxClosure,
  buildIntegrityShieldPromptAppend,
  GAFCORE_INTEGRITY_SHIELD_RULE,
  GAFCORE_ANTI_CRASH_RUNTIME_SNIPPET,
  type IntegrityShieldResult,
  type ImpactAnalysis,
} from "@/lib/gafcore-integrity-shield.shared";

/** Loop Safe-Build: validación + diagnoseAndRepair + corrección (chat servidor). */
export { runSafeBuildQualityLoop } from "@/services/ai/safe-build.server";
export {
  resolveModelForGafcoreChat,
  isDeepModeInstruction,
  inferChatBrainTask,
} from "@/services/ai/chat-brain.server";
