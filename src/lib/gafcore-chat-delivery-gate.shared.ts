/**
 * Puerta de validación: no entregar deltas que rompan sintaxis al preview.
 */
import {
  auditProjectLocally,
  buildValidationFixInstruction,
  formatValidationForUser,
  type ProjectValidationIssue,
} from "@/lib/gafcore-ai-validation.shared";
import type { ProjFile } from "@/lib/gafcore-chat.shared";
import { mergeContextWithDelta } from "@/lib/gafcore-brain-agent.shared";
import type { GafcoreDeliveredFile } from "@/lib/gafcore-chat-delivery.shared";
import { detectCorruptJsxInFiles } from "@/lib/gafcore-jsx-corrupt.shared";
import { healUntilStable } from "@/core/pipeline/syntax-heal.shared";
import { validateGafcoreProjectCore } from "@/lib/gafcore-validate.server";

export type DeliveryGateResult = {
  ok: boolean;
  files: GafcoreDeliveredFile[];
  issues: ProjectValidationIssue[];
  userMessage: string;
  fixInstruction: string;
};

export async function gateDeliveredFiles(
  contextFiles: ProjFile[],
  deltaFiles: GafcoreDeliveredFile[],
  originalInstruction: string,
): Promise<DeliveryGateResult> {
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

  // Heurísticas no-sintácticas (imports, build, functional). La sintaxis ya no
  // bloquea aquí: las reglas regex emiten `warn` y Babel es la autoridad real.
  const audit = auditProjectLocally(healedMerged.files);

  // Babel standalone = mismo motor que el preview del navegador → paridad real.
  // Autoridad única de error de sintaxis TS/JSX (entiende genéricos, evita el
  // falso positivo de useState<string> que el contador de tags marcaba).
  const transpile = await validateGafcoreProjectCore(
    healedMerged.files.map((f) => ({ name: f.name, content: f.content })),
  );
  const syntaxBlocking = transpile.issues.filter(
    (i) => i.severity === "error" && i.category === "syntax",
  );

  // Combinamos: errores no-sintácticos de la heurística + errores de sintaxis de Babel.
  const heuristicBlocking = audit.issues.filter(
    (i) => i.severity === "error" && i.category !== "syntax",
  );
  const blocking = [...heuristicBlocking, ...syntaxBlocking];
  const allIssues = [...audit.issues, ...syntaxBlocking];

  const deliverFiles = healedDelta.files.map((d) => {
    const m = healedMerged.files.find((f) => f.name === d.name);
    return m ? { ...d, content: m.content } : d;
  });

  if (blocking.length === 0) {
    return {
      ok: true,
      files: deliverFiles,
      issues: allIssues,
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
