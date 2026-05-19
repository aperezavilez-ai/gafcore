import type { ProjectValidationIssue } from "@/lib/gafcore-ai-validation.shared";
import type { ValidationFileInput } from "@/validation/types";

/** Referencias a variables de entorno sin documentar en proyecto IDE (heurística). */
export function auditEnvRules(files: ValidationFileInput[]): ProjectValidationIssue[] {
  const issues: ProjectValidationIssue[] = [];
  const envRefs = new Set<string>();

  for (const f of files) {
    if (!/\.(tsx?|jsx?|js|mjs|cjs)$/i.test(f.name)) continue;
    const matches = f.content.matchAll(/import\.meta\.env\.([A-Z0-9_]+)/g);
    for (const m of matches) {
      if (m[1]) envRefs.add(m[1]);
    }
  }

  const envExample = files.find((f) => /env\.example$/i.test(f.name) || f.name === ".env.example");
  const exampleContent = envExample?.content ?? "";

  for (const key of envRefs) {
    if (!exampleContent.includes(key)) {
      issues.push({
        severity: "warn",
        category: "build",
        file: envExample?.name ?? ".env.example",
        message: `Variable ${key} usada pero no documentada en .env.example.`,
      });
    }
  }

  return issues;
}
