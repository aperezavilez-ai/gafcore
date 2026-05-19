import type { ProjectValidationIssue } from "@/lib/gafcore-ai-validation.shared";
import type { ValidationFileInput } from "@/validation/types";

const SECRET_PATTERNS: Array<{ re: RegExp; message: string }> = [
  { re: /\bsk_(live|test)_[a-zA-Z0-9]{10,}\b/, message: "Posible clave Stripe en código." },
  { re: /\bAKIA[0-9A-Z]{16}\b/, message: "Posible clave AWS en código." },
  { re: /Bearer\s+[a-zA-Z0-9._-]{20,}/, message: "Posible token Bearer hardcodeado." },
  { re: /\beval\s*\(/, message: "Uso de eval() — riesgo de seguridad." },
  { re: /dangerouslySetInnerHTML/, message: "dangerouslySetInnerHTML — revisar XSS." },
];

export function auditSecurityRules(files: ValidationFileInput[]): ProjectValidationIssue[] {
  const issues: ProjectValidationIssue[] = [];
  for (const f of files) {
    if (!/\.(tsx?|jsx?|js|mjs|cjs|json|env)$/i.test(f.name)) continue;
    for (const { re, message } of SECRET_PATTERNS) {
      if (re.test(f.content)) {
        issues.push({
          severity: re.source.includes("eval") ? "error" : "warn",
          category: "build",
          file: f.name,
          message,
        });
      }
    }
  }
  return issues;
}
