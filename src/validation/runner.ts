import {
  mergeValidationResults,
  type ProjectValidationIssue,
} from "@/lib/gafcore-ai-validation.shared";
import { validateGafcoreProjectCore } from "@/lib/gafcore-validate.server";
import { auditEnvRules } from "@/validation/rules/env.rule";
import { auditSecurityRules } from "@/validation/rules/security.rule";
import {
  computeQualityScore,
  deriveValidationStatus,
} from "@/validation/scorers/quality-score";
import { applyDeterministicAutofix } from "@/validation/autofix/registry";
import type {
  ValidationLogEvent,
  ValidationReport,
  ValidationRunInput,
} from "@/validation/types";

const MAX_AUTOFIX_PASSES = 2;

function log(logs: ValidationLogEvent[], event: string, meta?: Record<string, unknown>) {
  logs.push({ at: new Date().toISOString(), event, meta });
}

/**
 * Punto único del AI Validation Layer (V1).
 * Orquesta reglas existentes + security/env + scoring.
 */
export async function runValidationLayer(input: ValidationRunInput): Promise<ValidationReport> {
  const logs: ValidationLogEvent[] = [];
  const files = input.files.slice(0, 40).map((f) => ({
    name: f.name,
    content: f.content,
  }));

  log(logs, "validation.started", {
    phase: input.phase,
    projectId: input.projectId,
    pipelineRunId: input.pipelineRunId,
    fileCount: files.length,
  });

  log(logs, "validation.rule.core", { step: "syntax+imports+build+functional" });
  const core = await validateGafcoreProjectCore(files);

  log(logs, "validation.rule.security");
  const securityIssues = auditSecurityRules(files);

  log(logs, "validation.rule.env");
  const envIssues = auditEnvRules(files);

  const merged = mergeValidationResults(
    { ok: core.ok, issues: core.issues },
    { ok: securityIssues.length === 0, issues: securityIssues },
    { ok: envIssues.length === 0, issues: envIssues },
  );

  const { dimensions, overallScore } = computeQualityScore(merged.issues, files);
  const status = deriveValidationStatus(overallScore, merged.issues);
  const approved = status === "approved" || status === "approved_with_warnings";

  log(logs, "validation.completed", {
    status,
    overallScore,
    approved,
    issueCount: merged.issues.length,
  });

  return {
    status,
    approved,
    overallScore,
    dimensions,
    issues: merged.issues,
    blockingErrorCount: merged.issues.filter((i) => i.severity === "error").length,
    warningCount: merged.issues.filter((i) => i.severity === "warn").length,
    logs,
  };
}

/** Resumen corto para UI del IDE. */
export function formatValidationScoreLabel(report: ValidationReport): string {
  return formatValidationScoreShort(report.overallScore, report.status);
}

export type ValidationWithAutofixResult = {
  report: ValidationReport;
  files: ValidationRunInput["files"];
  fixesApplied: string[];
};

/** Validación + auto-fix determinista + revalidación (hasta 2 pasadas). */
export async function runValidationWithAutofix(
  input: ValidationRunInput,
): Promise<ValidationWithAutofixResult> {
  let files = input.files.slice(0, 40).map((f) => ({ name: f.name, content: f.content }));
  const fixesApplied: string[] = [];
  let report = await runValidationLayer({ ...input, files });

  for (let pass = 0; pass < MAX_AUTOFIX_PASSES; pass++) {
    if (report.approved && report.blockingErrorCount === 0) break;
    const fix = applyDeterministicAutofix(files);
    if (fix.applied.length === 0) break;
    fixesApplied.push(...fix.applied);
    files = fix.files;
    report = await runValidationLayer({
      ...input,
      files,
      phase: input.phase,
    });
    report.logs.push({
      at: new Date().toISOString(),
      event: "validation.autofix",
      meta: { pass: pass + 1, applied: fix.applied },
    });
  }

  return { report, files, fixesApplied };
}

export function formatValidationScoreShort(
  overallScore: number,
  status: ValidationReport["status"],
): string {
  if (status === "approved") {
    return `Calidad ${overallScore}/100 — aprobado`;
  }
  if (status === "approved_with_warnings") {
    return `Calidad ${overallScore}/100 — aprobado con avisos`;
  }
  return `Calidad ${overallScore}/100 — requiere corrección`;
}
