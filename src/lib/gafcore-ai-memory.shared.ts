import type { ProjectValidationIssue } from "@/lib/gafcore-ai-validation.shared";

export type MemoryKind = "error" | "solution";

export type ProjectMemoryRow = {
  kind: MemoryKind;
  fingerprint: string;
  message: string;
  solution_hint: string | null;
  hit_count: number;
};

/** Huella estable para deduplicar errores. */
export function validationFingerprint(issue: ProjectValidationIssue): string {
  const base = `${issue.category}|${issue.file}|${issue.message}`.toLowerCase().slice(0, 240);
  let h = 0;
  for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) | 0;
  return `v:${Math.abs(h).toString(36)}`;
}

export function formatMemoryHintsForPrompt(rows: ProjectMemoryRow[]): string {
  if (rows.length === 0) return "";
  const lines = rows.slice(0, 6).map((r) => {
    if (r.kind === "solution" && r.solution_hint) {
      return `- Solución conocida: ${r.solution_hint}`;
    }
    return `- Error frecuente: ${r.message}`;
  });
  return `\n\n[Memoria del proyecto — evita repetir estos fallos]\n${lines.join("\n")}`;
}

export function solutionHintFromIssues(issues: ProjectValidationIssue[]): string {
  const parts: string[] = [];
  if (issues.some((i) => i.category === "import")) {
    parts.push("Crea archivos importados o corrige rutas relativas.");
  }
  if (issues.some((i) => i.category === "syntax")) {
    parts.push("Revisa llaves, paréntesis y cierre de JSX.");
  }
  if (issues.some((i) => i.category === "build")) {
    parts.push("Asegura index.html, main.tsx, App.tsx export default y package.json.");
  }
  if (issues.some((i) => i.category === "functional")) {
    parts.push("Conecta onClick/onSubmit, useState y localStorage.");
  }
  return parts.join(" ") || "Corrige los archivos señalados en la validación.";
}
