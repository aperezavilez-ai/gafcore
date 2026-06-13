/**
 * Puerta de validación: no entregar deltas que rompan sintaxis al preview.
 */
import {
  auditProjectLocally,
  buildValidationFixInstruction,
  formatValidationForUser,
  hasBlockingValidationIssues,
  type ProjectValidationIssue,
} from "@/lib/gafcore-ai-validation.shared";
import type { ProjFile } from "@/lib/gafcore-chat.shared";
import { mergeContextWithDelta } from "@/lib/gafcore-brain-agent.shared";
import type { GafcoreDeliveredFile } from "@/lib/gafcore-chat-delivery.shared";
import { detectCorruptJsxInFiles } from "@/lib/gafcore-jsx-corrupt.shared";
import { healUntilStable } from "@/core/pipeline/syntax-heal.shared";

export type DeliveryGateResult = {
  ok: boolean;
  files: GafcoreDeliveredFile[];
  issues: ProjectValidationIssue[];
  userMessage: string;
  fixInstruction: string;
};

export function gateDeliveredFiles(
  contextFiles: ProjFile[],
  deltaFiles: GafcoreDeliveredFile[],
  originalInstruction: string,
): DeliveryGateResult {
  if (deltaFiles.length === 0) {
    return { ok: true, files: [], issues: [], userMessage: "", fixInstruction: "" };
  }

  const healedDelta = healUntilStable(deltaFiles);
  const merged = mergeContextWithDelta(contextFiles, healedDelta.files);
  const healedMerged = healUntilStable(merged);
  const corrupt = detectCorruptJsxInFiles(healedMerged.files);
  if (corrupt.length > 0) {
    const blocking = corrupt.map((c) => ({
      severity: "error" as const,
      category: "syntax" as const,
      file: c.file,
      message: c.message,
    }));
    return {
      ok: false,
      files: [],
      issues: blocking,
      userMessage: formatValidationForUser(blocking),
      fixInstruction: buildValidationFixInstruction(blocking, originalInstruction),
    };
  }

  const audit = auditProjectLocally(healedMerged.files);
  const blocking = audit.issues.filter((i) => i.severity === "error");
  const deliverFiles = healedDelta.files.map((d) => {
    const m = healedMerged.files.find((f) => f.name === d.name);
    return m ? { ...d, content: m.content } : d;
  });

  if (!hasBlockingValidationIssues(audit.issues)) {
    return {
      ok: true,
      files: deliverFiles,
      issues: audit.issues,
      userMessage: "",
      fixInstruction: "",
    };
  }

  const fixInstruction = buildValidationFixInstruction(blocking, originalInstruction);

  return {
    ok: false,
    files: [],
    issues: blocking,
    userMessage: formatValidationForUser(blocking),
    fixInstruction,
  };
}
