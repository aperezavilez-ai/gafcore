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

  const merged = mergeContextWithDelta(contextFiles, deltaFiles);
  const audit = auditProjectLocally(merged);
  const blocking = audit.issues.filter((i) => i.severity === "error");

  if (!hasBlockingValidationIssues(audit.issues)) {
    return {
      ok: true,
      files: deltaFiles,
      issues: audit.issues,
      userMessage: audit.issues.length > 0 ? formatValidationForUser(audit.issues) : "",
      fixInstruction: "",
    };
  }

  const fixInstruction = buildValidationFixInstruction(blocking, originalInstruction);
  const syntaxOnly = blocking.every((i) => i.category === "syntax" || i.category === "import");
  if (syntaxOnly && deltaFiles.length > 0) {
    return {
      ok: true,
      files: deltaFiles,
      issues: audit.issues,
      userMessage: formatValidationForUser(blocking),
      fixInstruction,
    };
  }

  return {
    ok: false,
    files: [],
    issues: blocking,
    userMessage: formatValidationForUser(blocking),
    fixInstruction,
  };
}
