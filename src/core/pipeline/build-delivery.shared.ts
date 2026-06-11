import type { ProjFile } from "@/lib/gafcore-chat.shared";
import { aiReplyLooksLikePlanOnly } from "@/lib/gafcore-chat-intent.shared";
import {
  finalizeGafcoreBuildDelivery,
  outputReplacesWelcome,
  type FinalizeBuildResult,
  type GafcoreDeliveredFile,
} from "@/lib/gafcore-chat-delivery.shared";

export type ResolveBuildDeliveryInput = {
  instruction: string;
  contextFiles: ProjFile[];
  reply: string;
  rawFiles: unknown;
};

/** Normaliza respuesta IA → archivos aplicables (unwrap, repair, bootstrap). */
export function resolveBuildDelivery(input: ResolveBuildDeliveryInput): FinalizeBuildResult {
  return finalizeGafcoreBuildDelivery(
    input.instruction,
    input.contextFiles,
    input.reply,
    input.rawFiles,
  );
}

/**
 * El agente en servidor ya ejecutó finalize + gate + heal.
 * Evita reprocesar el mismo delta en cliente (doble shield / pérdida de estado).
 */
export function resolveAgentBuildDelivery(input: {
  instruction: string;
  contextFiles: ProjFile[];
  reply: string;
  agentFiles: GafcoreDeliveredFile[];
}): FinalizeBuildResult {
  if (input.agentFiles.length > 0) {
    return {
      reply: input.reply,
      files: input.agentFiles,
      source: "ai",
      planOnly: aiReplyLooksLikePlanOnly(input.reply),
    };
  }
  return resolveBuildDelivery({
    instruction: input.instruction,
    contextFiles: input.contextFiles,
    reply: input.reply,
    rawFiles: input.agentFiles,
  });
}

export function buildDeliveryNeedsWelcomeReplace(
  contextFiles: ProjFile[],
  files: Array<{ name: string; content: string }>,
): boolean {
  return files.length > 0 && !outputReplacesWelcome(contextFiles, files);
}
