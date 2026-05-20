import {
  buildGafcoreMessages,
  validateOutputFiles,
  COST_PER_REQUEST,
  type ProjFile,
  gafcoreChatBodySchema,
} from "@/lib/gafcore-chat.shared";
import {
  completeChatMessage,
  consumeAiCredits,
  getGafcoreAiGateway,
  refundAiCredits,
  resolveGatewayModel,
} from "@/lib/gafcore-ai-gateway.server";
import { isGafcoreAdminUser } from "@/lib/gafcore-admin-role.server";
import { retrieveProjectMemoryContext } from "@/memory/retrieve.server";
import { enrichGafcoreOutputFiles } from "@/lib/gafcore-media.server";
import { extractVisionImageParts, patchProjectFilesVisually } from "@/lib/gafcore-media.shared";
import { softenRoboticReply } from "@/lib/gafcore-chat-intent.shared";
import { sanitizeUserFacingAiText } from "@/lib/gafcore-user-facing-errors";
import type { AgentType } from "@/tasks/types";
import { agentTypeLabel } from "@/tasks/artifacts.shared";

export type ChatExecutorResult = {
  reply: string;
  files: ProjFile[];
};

/** Ejecuta una instrucción de agente vía gateway (misma lógica que /api/gafcore/chat/complete). */
export async function runGafcoreChatForUser(opts: {
  userId: string;
  projectId?: string;
  instruction: string;
  files: ProjFile[];
  agentType?: AgentType;
  workflowGoal?: string;
}): Promise<ChatExecutorResult> {
  const agentPrefix = opts.agentType
    ? `[Agente ${agentTypeLabel(opts.agentType)}] Enfócate solo en tu ámbito. `
    : "";
  const goalPrefix = opts.workflowGoal
    ? `[Objetivo del workflow] ${opts.workflowGoal.slice(0, 500)}\n`
    : "";
  const instruction = `${goalPrefix}${agentPrefix}${opts.instruction}`;

  const body = gafcoreChatBodySchema.parse({
    history: [],
    instruction,
    files: opts.files,
    projectId: opts.projectId,
  });

  const gateway = getGafcoreAiGateway();
  const memory = await retrieveProjectMemoryContext({
    projectId: body.projectId,
    userId: opts.userId,
    instruction: body.instruction,
    files: body.files as ProjFile[],
  });
  const model = resolveGatewayModel(gateway, {
    instruction: body.instruction,
    hasVision: extractVisionImageParts(body.files as ProjFile[]).length > 0,
    tier: opts.agentType === "validation" ? "fast" : "deep",
  });
  const { messages } = buildGafcoreMessages(
    body,
    model,
    memory.promptAppendix,
    memory.priorityPaths,
  );

  const skipCredits = await isGafcoreAdminUser(opts.userId);
  if (!skipCredits) {
    const credit = await consumeAiCredits(opts.userId, COST_PER_REQUEST, "gafcore_workflow_task", {
      agent: opts.agentType,
      instruction_len: body.instruction.length,
    });
    if (!credit.ok) {
      throw new Error(credit.error === "insufficient_credits" ? "INSUFFICIENT_CREDITS" : "CREDITS_ERROR");
    }
  }

  try {
    const { content } = await completeChatMessage({ model, messages, json: true });
    let parsedOut: { reply?: string; files?: unknown };
    try {
      parsedOut = JSON.parse(content || "{}");
    } catch {
      return {
        reply: sanitizeUserFacingAiText(softenRoboticReply(body.instruction, content)),
        files: [],
      };
    }
    let safeFiles = validateOutputFiles(parsedOut.files);
    if (safeFiles.length === 0) {
      const localPatch = patchProjectFilesVisually(body.files as ProjFile[], body.instruction);
      if (localPatch.length > 0) safeFiles = localPatch;
    }
    try {
      safeFiles = await enrichGafcoreOutputFiles(
        safeFiles,
        body.files as ProjFile[],
        body.instruction,
      );
    } catch {
      /* optional */
    }
    const reply = sanitizeUserFacingAiText(
      softenRoboticReply(
        body.instruction,
        typeof parsedOut.reply === "string" ? parsedOut.reply : "Listo.",
      ),
    );
    return { reply, files: safeFiles };
  } catch (e) {
    if (!skipCredits) {
      await refundAiCredits(opts.userId, COST_PER_REQUEST, "gafcore_workflow_refund", {
        error: String((e as Error)?.message ?? e),
      });
    }
    throw e;
  }
}
