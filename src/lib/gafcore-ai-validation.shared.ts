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

  // Sintaxis: las heurísticas por regex (conteo de llaves/tags) NO entienden
  // genéricos TS (useState<string>, useRef<HTMLInputElement>) y producen falsos
  // positivos. Babel real (validateGafcoreProjectCore) es la autoridad de error
  // de sintaxis; aquí solo emitimos `warn` informativo, nunca bloqueante.
  for (const f of files) {
    if (!/\.(tsx|jsx)$/i.test(f.name)) continue;
    const closure = auditSyntaxClosure(f.content);
    if (!closure.ok) {
      issues.push({
        severity: "warn",
        category: "syntax",
        file: f.name,
        message: `Posible cierre sintáctico (heurística): ${closure.messages.join("; ")}.`,
      });
    } else {
      const tagBalance = auditJsxTagBalance(f.content);
      if (tagBalance !== 0) {
        issues.push({
          severity: "warn",
          category: "syntax",
          file: f.name,
          message: `Posible desbalance de tags JSX (heurística, ${tagBalance > 0 ? "faltan cierres" : "sobran cierres"}).`,
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
  const byCategory: Record<ValidationCategory, ProjectValidationIssue[]> = {
    syntax: [],
    import: [],
    build: [],
    functional: [],
  };
  for (const i of issues.slice(0, 12)) {
    byCategory[i.category].push(i);
  }

  const sections: string[] = [];

  if (byCategory.syntax.length > 0) {
    const lines = byCategory.syntax.map((i) => `  · ${i.file}: ${i.message}`).join("\n");
    sections.push(
      `[SINTAXIS — CRÍTICO]\n${lines}\n` +
      `  → Regla: cada { necesita }, cada ( necesita ), cada <Tag> necesita </Tag> o />. ` +
      `Revisa balance antes de emitir. Divide archivos >200 líneas en components/.`,
    );
  }

  if (byCategory.import.length > 0) {
    const lines = byCategory.import.map((i) => `  · ${i.file}: ${i.message}`).join("\n");
    sections.push(
      `[IMPORTS — CRÍTICO]\n${lines}\n` +
      `  → Regla: importa TODOS los símbolos usados (useState, useEffect, iconos lucide). ` +
      `Sin import *. Rutas relativas con ./NombreExacto (case-sensitive).`,
    );
  }

  if (byCategory.build.length > 0) {
    const lines = byCategory.build.map((i) => `  · ${i.file}: ${i.message}`).join("\n");
    sections.push(
      `[BUILD]\n${lines}\n` +
      `  → Regla: App.tsx necesita export default function App(). main.tsx llama createRoot. ` +
      `index.html con <div id="root">. Sin react-router-dom.`,
    );
  }

  if (byCategory.functional.length > 0) {
    const lines = byCategory.functional.map((i) => `  · ${i.file}: ${i.message}`).join("\n");
    sections.push(
      `[FUNCIONAL]\n${lines}\n` +
      `  → Regla: todos los <button> necesitan onClick, todos los <form> necesitan onSubmit. ` +
      `Sin href="#" vacío. Flujo completo: estado + handler + feedback visible.`,
    );
  }

  const issueBlock = sections.join("\n\n");
  const hasBlocker = byCategory.syntax.length > 0 || byCategory.import.length > 0;

  return (
    `[GAFCORE CORRECCIÓN AUTOMÁTICA]\n` +
    (hasBlocker ? `⚠ Hay errores bloqueantes — el preview no carga. Corrige PRIMERO sintaxis e imports.\n\n` : "") +
    `${issueBlock}\n\n` +
    `Pedido original: ${originalUserRequest.slice(0, 400)}\n` +
    `Instrucción: devuelve SOLO los archivos corregidos (delta mínimo). ` +
    `No añadas features nuevas. No respondas solo con texto.`
  );
}

export { formatFunctionalAuditForUser, hasFunctionalBlockingIssues };
