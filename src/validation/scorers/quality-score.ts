import type { ProjectValidationIssue } from "@/lib/gafcore-ai-validation.shared";
import type { QualityDimensions, ValidationFileInput, ValidationStatus } from "@/validation/types";

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function computeQualityScore(
  issues: ProjectValidationIssue[],
  files: ValidationFileInput[],
): { dimensions: QualityDimensions; overallScore: number } {
  const errors = issues.filter((i) => i.severity === "error");
  const warns = issues.filter((i) => i.severity === "warn");

  const byCat = (cat: ProjectValidationIssue["category"]) =>
    issues.filter((i) => i.category === cat && i.severity === "error").length;

  const stability = clamp(100 - errors.length * 12 - byCat("syntax") * 8);
  const compatibility = clamp(100 - byCat("import") * 10 - byCat("build") * 5);
  const functionality = clamp(100 - byCat("functional") * 15);
  const structure = clamp(100 - (files.length < 2 ? 20 : 0) - byCat("build") * 8);
  const security = clamp(100 - issues.filter((i) => i.message.includes("seguridad") || i.message.includes("Stripe") || i.message.includes("eval")).length * 25);
  const maintainability = clamp(
    100 -
      files.filter((f) => f.content.length > 25_000).length * 15 -
      warns.length * 2,
  );
  const performance = clamp(
    100 -
      files.filter((f) => /\.(tsx|jsx)$/.test(f.name) && !/width=|height=|aspect-/.test(f.content) && f.content.includes("<img")).length * 5,
  );

  const dimensions: QualityDimensions = {
    stability,
    compatibility,
    functionality,
    structure,
    security,
    maintainability,
    performance,
  };

  const overallScore = clamp(
    stability * 0.25 +
      compatibility * 0.15 +
      functionality * 0.1 +
      structure * 0.15 +
      security * 0.15 +
      maintainability * 0.1 +
      performance * 0.1,
  );

  return { dimensions, overallScore };
}

export function deriveValidationStatus(
  overallScore: number,
  issues: ProjectValidationIssue[],
): ValidationStatus {
  const hasErrors = issues.some((i) => i.severity === "error");
  if (hasErrors || overallScore < 70) return "failed";
  if (overallScore >= 85) return "approved";
  return "approved_with_warnings";
}
