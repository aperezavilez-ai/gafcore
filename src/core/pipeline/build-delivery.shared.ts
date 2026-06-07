import type { ProjFile } from "@/lib/gafcore-chat.shared";
import {
  finalizeGafcoreBuildDelivery,
  outputReplacesWelcome,
  type FinalizeBuildResult,
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

export function buildDeliveryNeedsWelcomeReplace(
  contextFiles: ProjFile[],
  files: Array<{ name: string; content: string }>,
): boolean {
  return files.length > 0 && !outputReplacesWelcome(contextFiles, files);
}
