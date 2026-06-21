/**
 * Loop Safe-Build: validación → diagnoseAndRepair → corrección antes de entregar.
 */
import {
  completeChatMessage,
  type GafcoreAiGateway,
} from "@/lib/gafcore-ai-gateway.server";
import {
  validateOutputFiles,
  type ProjFile,
  type GafcoreChatMessage,
} from "@/lib/gafcore-chat.shared";
import { isSubstantiveBuildRequest } from "@/lib/gafcore-chat-intent.shared";
import {
  auditProjectLocally,
  buildValidationFixInstruction,
  hasBlockingValidationIssues,
  type ProjectValidationIssue,
} from "@/lib/gafcore-ai-validation.shared";
import { parseJsonLoose } from "@/lib/gafcore-json-loose.shared";
import { repairGafcoreOutputFiles } from "@/lib/gafcore-media.shared";
import { diagnoseAndRepair } from "@/services/health/gafcoreSystemic.server";
import { sanitizeDiagnosisForUser } from "@/lib/gafcore-user-facing-errors";
import {
  formatActionableFixInstruction,
  tryApplyStructuredFixToProjectFiles,
} from "@/services/health/gafcoreSystemicFix.shared";
import type { StructuredActionableFix } from "@/services/health/gafcoreSystemicFix.shared";
import { resolveSafeBuildRepairModel } from "@/services/ai/chat-brain.server";
import type { SafeBuildMeta, SafeBuildPhase } from "@/services/ai/safe-build.shared";
import { gateDeliveredFiles } from "@/lib/gafcore-chat-delivery-gate.shared";
import { mergeContextWithDelta } from "@/lib/gafcore-brain-agent.shared";

export type SafeBuildLoopInput = {
  instruction: string;
  reply: string;
  files: ProjFile[];
  contextFiles: ProjFile[];
  messages: GafcoreChatMessage[];
  gateway: GafcoreAiGateway;
  deepMode?: boolean;
};

export type SafeBuildLoopResult = {
  reply: string;
  files: ProjFile[];
  meta: SafeBuildMeta;
  issues: ProjectValidationIssue[];
};

function mergeRepairedFiles(original: ProjFile[], delta: ProjFile[]): ProjFile[] {
  if (delta.length === 0) return original;
  const map = new Map(original.map((f) => [f.name, f]));
  for (const f of delta) map.set(f.name, f);
  return [...map.values()];
}

/**
 * a) Código ya generado con motor de diseño en system prompt.
 * b) Validación local rápida.
 * c) Si hay errores bloqueantes → diagnoseAndRepair + un intento de corrección IA.
 */
export async function runSafeBuildQualityLoop(
  input: SafeBuildLoopInput,
): Promise<SafeBuildLoopResult> {
  const baseMeta: SafeBuildMeta = { phase: "ready", repaired: false, skipped: true };

  if (!isSubstantiveBuildRequest(input.instruction)) {
    return {
      reply: input.reply,
      files: input.files,
      meta: baseMeta,
      issues: [],
    };
  }

  let files = input.files;
  let reply = input.reply;
  let phase: SafeBuildPhase = "validating";

  const firstAudit = auditProjectLocally(files);
  if (!hasBlockingValidationIssues(firstAudit.issues)) {
    return {
      reply,
      files,
      meta: { phase: "ready", repaired: false, skipped: false },
      issues: firstAudit.issues,
    };
  }

  phase = "repairing";

  const issuesSummary = firstAudit.issues
    .filter((i) => i.severity === "error")
    .slice(0, 8)
    .map((i) => `${i.file}: ${i.message}`)
    .join("; ");

  const diagnosis = await diagnoseAndRepair({
    component: "gafcore.safe_build",
    message: issuesSummary,
    detail: { issues: firstAudit.issues, instruction: input.instruction.slice(0, 500) },
  });

  if (
    diagnosis.actionableFix &&
    typeof diagnosis.actionableFix === "object" &&
    !Array.isArray(diagnosis.actionableFix)
  ) {
    const patched = tryApplyStructuredFixToProjectFiles(
      files,
      diagnosis.actionableFix as StructuredActionableFix,
    );
    if (patched) files = patched as ProjFile[];
  }

  const fixText = formatActionableFixInstruction({
    rootCause: diagnosis.rootCause,
    userFriendlyMessage: diagnosis.userFriendlyMessage,
    actionableFix: diagnosis.actionableFix,
  });

  // Incluir contenido de archivos con errores de sintaxis para reparación precisa
  const errorFiles = firstAudit.issues
    .filter((i) => i.severity === "error" && i.category === "syntax")
    .map((i) => i.file)
    .filter((v, idx, arr) => arr.indexOf(v) === idx)
    .slice(0, 3);

  const errorFilesContext = errorFiles
    .map((name) => {
      const f = files.find((f) => f.name === name);
      if (!f) return "";
      return `\n--- ARCHIVO CON ERROR: ${name} ---\n${f.content.slice(0, 3000)}\n--- FIN ${name} ---`;
    })
    .filter(Boolean)
    .join("\n");

  const fixInstruction = fixText
    ? `[SAFE-BUILD / GAFCORE] Corrige el proyecto. Diagnóstico: ${diagnosis.rootCause}\n\nParche sugerido:\n${fixText}\n\nArchivos con errores que DEBES corregir completamente:${errorFilesContext}\n\nPedido original: ${input.instruction.slice(0, 400)}`
    : `[SAFE-BUILD] ${buildValidationFixInstruction(firstAudit.issues, input.instruction)}\n\nArchivos con errores que DEBES corregir completamente:${errorFilesContext}\n\nContexto diagnóstico: ${diagnosis.userFriendlyMessage}`;

  const repairModel = resolveSafeBuildRepairModel(input.gateway, Boolean(input.deepMode));

  const fixMessages: GafcoreChatMessage[] = [
    ...input.messages,
    { role: "assistant", content: JSON.stringify({ reply, files: files.slice(0, 12) }) },
    { role: "user", content: fixInstruction },
  ];

  let repairedDelta: ProjFile[] = [];

  try {
    const completed = await completeChatMessage({
      model: repairModel,
      messages: fixMessages,
      temperature: 0.35,
      json: true,
    });
    const parsed = parseJsonLoose<{ reply?: string; files?: unknown }>(completed.content) ?? {};
    repairedDelta = repairGafcoreOutputFiles(validateOutputFiles(parsed.files));
    if (repairedDelta.length > 0) {
      files = mergeRepairedFiles(files, repairedDelta);
      if (typeof parsed.reply === "string" && parsed.reply.trim()) {
        reply = parsed.reply;
      } else if (diagnosis.userFriendlyMessage) {
        reply = `${reply}\n\n${sanitizeDiagnosisForUser(diagnosis)}`.trim();
      }
    }
  } catch (e) {
    console.warn(
      JSON.stringify({
        event: "gafcore_safe_build_repair_failed",
        message: e instanceof Error ? e.message : String(e),
      }),
    );
  }

  const mergedProject = mergeContextWithDelta(input.contextFiles, files);
  const gate = await gateDeliveredFiles(
    input.contextFiles,
    files,
    input.instruction,
  );
  if (!gate.ok && files.length > 0) {
    return {
      reply: `${reply}\n\nNo se aplicaron cambios: ${gate.userMessage}`,
      files: [],
      meta: { phase: "repairing", repaired: false, skipped: false },
      issues: gate.issues,
    };
  }

  const finalAudit = auditProjectLocally(mergedProject);
  const repaired = !hasBlockingValidationIssues(finalAudit.issues) && gate.files.length > 0;

  return {
    reply,
    files: gate.files,
    meta: {
      phase: repaired ? "ready" : phase,
      repaired: repaired || repairedDelta.length > 0,
      skipped: false,
    },
    issues: finalAudit.issues,
  };
}
