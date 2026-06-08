/**
 * AI Validation Layer — sintaxis, imports, build heurístico, functional-first.
 */
import {
  auditFunctionalFirst,
  type FunctionalAuditIssue,
  formatFunctionalAuditForUser,
  hasFunctionalBlockingIssues,
} from "@/lib/gafcore-functional-first.shared";
import { auditJsxTagBalance } from "@/lib/gafcore-incremental-edit.shared";
import { auditSyntaxClosure } from "@/lib/gafcore-integrity-shield.shared";

export type ValidationSeverity = "error" | "warn";
export type ValidationCategory = "syntax" | "import" | "build" | "functional";

export type ProjectValidationIssue = {
  severity: ValidationSeverity;
  category: ValidationCategory;
  file: string;
  message: string;
};

export type ProjectValidationResult = {
  ok: boolean;
  issues: ProjectValidationIssue[];
};

const NPM_BARE_OK = new Set([
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "vite",
  "@vitejs/plugin-react",
  // Preview IDE resuelve vía esm.sh — no hace falta package.json en el proyecto virtual.
  "lucide-react",
  "clsx",
  "tailwind-merge",
  "class-variance-authority",
  "framer-motion",
  "recharts",
  "@radix-ui/react-slot",
]);

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+/g, "/");
}

function resolveRelative(fromFile: string, spec: string): string[] {
  const base = normalizePath(fromFile).split("/");
  base.pop();
  const parts = spec.replace(/\\/g, "/").split("/");
  for (const p of parts) {
    if (p === "." || p === "") continue;
    if (p === "..") base.pop();
    else base.push(p);
  }
  const joined = base.join("/");
  const exts = ["", ".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts", "/index.jsx"];
  return exts.map((e) => normalizePath(`${joined}${e}`));
}

function auditImports(files: Array<{ name: string; content: string }>): ProjectValidationIssue[] {
  const issues: ProjectValidationIssue[] = [];
  const names = new Set(files.map((f) => normalizePath(f.name)));

  for (const f of files) {
    if (!/\.(tsx?|jsx?|mjs|cjs)$/i.test(f.name)) continue;
    const re =
      /import\s+(?:type\s+)?(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(f.content))) {
      const spec = (m[1] || m[2] || "").trim();
      if (!spec) continue;
      if (spec.startsWith(".") || spec.startsWith("/")) {
        const candidates = resolveRelative(f.name, spec);
        const found = candidates.some((c) => names.has(c));
        if (!found) {
          issues.push({
            severity: "error",
            category: "import",
            file: f.name,
            message: `Import roto: "${spec}" (no existe en el proyecto).`,
          });
        }
      } else if (!spec.startsWith("http") && !NPM_BARE_OK.has(spec) && !spec.startsWith("@/")) {
        const pkg = spec.split("/")[0].startsWith("@")
          ? spec.split("/").slice(0, 2).join("/")
          : spec.split("/")[0];
        if (!NPM_BARE_OK.has(pkg) && !names.has("package.json")) {
          issues.push({
            severity: "warn",
            category: "import",
            file: f.name,
            message: `Dependencia "${pkg}" — verifica package.json.`,
          });
        }
      }
    }
  }
  return issues;
}

function auditBuildReadiness(files: Array<{ name: string; content: string }>): ProjectValidationIssue[] {
  const issues: ProjectValidationIssue[] = [];
  const names = files.map((f) => normalizePath(f.name));
  const has = (n: string) => names.some((x) => x === n || x.endsWith(`/${n}`));

  if (!has("index.html")) {
    issues.push({
      severity: "warn",
      category: "build",
      file: "index.html",
      message: "Falta index.html para Vite.",
    });
  }
  if (!has("main.tsx") && !has("main.jsx")) {
    issues.push({
      severity: "error",
      category: "build",
      file: "main.tsx",
      message: "Falta punto de entrada main.tsx/main.jsx.",
    });
  }
  const appFile = files.find((f) => /^app\.(tsx|jsx)$/i.test(normalizePath(f.name)));
  if (!appFile) {
    issues.push({
      severity: "error",
      category: "build",
      file: "App.tsx",
      message: "Falta App.tsx con export default.",
    });
  } else if (!/export\s+default/.test(appFile.content)) {
    issues.push({
      severity: "error",
      category: "build",
      file: appFile.name,
      message: "App.tsx sin export default.",
    });
  }

  const pkg = files.find((f) => normalizePath(f.name) === "package.json");
  if (pkg) {
    try {
      const j = JSON.parse(pkg.content) as { dependencies?: Record<string, string> };
      const deps = { ...j.dependencies };
      const usesReact = files.some((f) => /\.(tsx|jsx)$/i.test(f.name));
      if (usesReact && !deps.react) {
        issues.push({
          severity: "warn",
          category: "build",
          file: "package.json",
          message: 'Falta dependencia "react" en package.json.',
        });
      }
    } catch {
      issues.push({
        severity: "error",
        category: "build",
        file: "package.json",
        message: "package.json inválido (JSON).",
      });
    }
  } else if (files.some((f) => /\.(tsx|jsx)$/i.test(f.name))) {
    issues.push({
      severity: "warn",
      category: "build",
      file: "package.json",
      message: "Proyecto React sin package.json.",
    });
  }

  for (const f of files) {
    if (!/\.(tsx|jsx)$/i.test(f.name)) continue;
    const closure = auditSyntaxClosure(f.content);
    if (!closure.ok) {
      issues.push({
        severity: "error",
        category: "syntax",
        file: f.name,
        message: `Cierre sintáctico: ${closure.messages.join("; ")}.`,
      });
    } else {
      const tagBalance = auditJsxTagBalance(f.content);
      if (tagBalance !== 0) {
        issues.push({
          severity: "error",
          category: "syntax",
          file: f.name,
          message: `Tags JSX desbalanceados (${tagBalance > 0 ? "faltan cierres" : "sobran cierres"}).`,
        });
      }
    }
  }

  return issues;
}

function mapFunctional(issues: FunctionalAuditIssue[]): ProjectValidationIssue[] {
  return issues.map((i) => ({
    severity: i.severity,
    category: "functional" as const,
    file: i.file,
    message: i.message,
  }));
}

function mapSyntaxErrors(errors: { name: string; message: string }[]): ProjectValidationIssue[] {
  return errors.map((e) => ({
    severity: "error" as const,
    category: "syntax" as const,
    file: e.name,
    message: e.message,
  }));
}

/** Auditoría completa en cliente (instantánea). */
export function auditProjectLocally(
  files: Array<{ name: string; content: string }>,
): ProjectValidationResult {
  const issues: ProjectValidationIssue[] = [
    ...mapFunctional(auditFunctionalFirst(files).issues),
    ...auditImports(files),
    ...auditBuildReadiness(files),
  ];
  const ok = !issues.some((i) => i.severity === "error");
  return { ok, issues };
}

export function mergeValidationResults(
  ...parts: ProjectValidationResult[]
): ProjectValidationResult {
  const seen = new Set<string>();
  const issues: ProjectValidationIssue[] = [];
  for (const p of parts) {
    for (const i of p.issues) {
      const key = `${i.category}:${i.file}:${i.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push(i);
    }
  }
  return { ok: !issues.some((i) => i.severity === "error"), issues };
}

export function formatValidationForUser(issues: ProjectValidationIssue[]): string {
  if (issues.length === 0) return "";
  return issues
    .slice(0, 8)
    .map((i) => `[${i.category}] ${i.file}: ${i.message}`)
    .join("\n");
}

export function hasBlockingValidationIssues(issues: ProjectValidationIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

export function shouldAutoRetryValidation(issues: ProjectValidationIssue[]): boolean {
  if (!hasBlockingValidationIssues(issues)) return false;
  const syntaxLike = issues.some(
    (i) =>
      i.severity === "error" &&
      (i.category === "syntax" ||
        /syntax|sintáct|jsx|desbalancead|unexpected token|react error #31/i.test(
          `${i.file} ${i.message}`,
        )),
  );
  if (syntaxLike) return false;
  return true;
}

export function buildValidationFixInstruction(
  issues: ProjectValidationIssue[],
  originalUserRequest: string,
): string {
  const list = issues
    .slice(0, 10)
    .map((i) => `- [${i.severity}/${i.category}] ${i.file}: ${i.message}`)
    .join("\n");
  return `[GAFCORE CORRECCIÓN] La entrega anterior falló validación. Corrige solo archivos necesarios (delta):
${list}
Pedido original: ${originalUserRequest.slice(0, 500)}
Obligatorio: imports resueltos, sintaxis válida, export default en App, handlers reales, sin TODO en flujo principal.`;
}

export { formatFunctionalAuditForUser, hasFunctionalBlockingIssues };
