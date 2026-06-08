/**
 * Análisis local pre-build (Reglas #1, #2, #4) — sin llamada IA extra.
 */
import { classifyUserIntent } from "@/orchestrator/intent.classifier";
import type { ProjectTypeHint } from "@/orchestrator/types";

export type ProjectAnalysisResult = {
  summary: string;
  projectType: ProjectTypeHint;
  complexity: "simple" | "medium" | "complex";
  diagram: string;
  workflowSteps: string[];
  integrations: string[];
};

const PROJECT_TYPE_LABEL: Record<ProjectTypeHint, string> = {
  blank: "proyecto web",
  landing: "landing page",
  ecommerce: "tienda online",
  app: "aplicación web",
  unknown: "proyecto personalizado",
};

function inferComplexity(text: string): ProjectAnalysisResult["complexity"] {
  const t = text.toLowerCase();
  const signals =
    (/\b(saas|dashboard|auth|login|supabase|stripe|api|backend|base de datos|multiagente)\b/i.test(
      t,
    ) ? 2 : 0) +
    (t.length > 180 ? 1 : 0) +
    (/\b(plataforma|marketplace|admin|roles|pagos)\b/i.test(t) ? 2 : 0);
  if (signals >= 3) return "complex";
  if (signals >= 1) return "medium";
  return "simple";
}

function buildWorkflowSteps(projectType: ProjectTypeHint, complexity: ProjectAnalysisResult["complexity"]): string[] {
  const base = [
    "Estructura base (App + preview)",
    "UI principal y navegación",
    "Formularios y handlers funcionales",
    "Estados, loading y persistencia local",
    "Responsive y QA del preview",
  ];
  const deploy = ["Export ZIP", "Conectar GitHub", "Deploy Vercel", "Dominio y producción"];
  if (complexity === "simple" && projectType === "landing") {
    return [...base.slice(0, 4), "Publicación"];
  }
  if (projectType === "ecommerce" || complexity !== "simple") {
    return [...base, "Integraciones (auth/APIs si aplica)", ...deploy];
  }
  return [...base, "Publicación"];
}

function buildDiagram(projectType: ProjectTypeHint, complexity: ProjectAnalysisResult["complexity"]): string {
  const lines = ["Frontend (React + preview GafCore)"];
  if (complexity !== "simple" || projectType === "ecommerce" || projectType === "app") {
    lines.push("↓", "Lógica / estado (handlers, forms)");
  }
  if (complexity === "complex") {
    lines.push("↓", "Backend / APIs (si aplica)", "↓", "Autenticación / datos");
  }
  lines.push("↓", "Validación + preview estable", "↓", "Deploy + dominio");
  return lines.join("\n");
}

function inferIntegrations(text: string, complexity: ProjectAnalysisResult["complexity"]): string[] {
  const t = text.toLowerCase();
  const list: string[] = [];
  if (/supabase|base de datos|auth|login|registro/i.test(t) || complexity !== "simple") {
    list.push("Supabase (auth/datos — opcional según pedido)");
  }
  if (/stripe|pago|suscripci/i.test(t)) list.push("Stripe (pagos)");
  if (/github|repo/i.test(t) || complexity === "complex") list.push("GitHub");
  if (/vercel|deploy|publicar|producci/i.test(t) || complexity !== "simple") {
    list.push("Vercel (deploy)");
  }
  if (list.length === 0) list.push("Preview GafCore (sin servicios externos obligatorios al inicio)");
  return list;
}

export function buildLocalProjectAnalysis(
  userText: string,
  fileCount: number,
): ProjectAnalysisResult {
  const intent = classifyUserIntent(userText, { mode: "build" });
  const complexity = inferComplexity(userText);
  const projectType = intent.projectType;
  const typeLabel = PROJECT_TYPE_LABEL[projectType] ?? PROJECT_TYPE_LABEL.unknown;
  const workflowSteps = buildWorkflowSteps(projectType, complexity);
  const integrations = inferIntegrations(userText, complexity);

  const summary =
    `Detecto un **${typeLabel}** (complejidad **${complexity}**). ` +
    `Trabajaré por etapas: primero preview estable, luego mejoras y publicación. ` +
    (fileCount <= 3
      ? "Partimos de la plantilla inicial."
      : `Tienes ${fileCount} archivos; conservaré lo ya construido salvo que pidas empezar de cero.`);

  return {
    summary,
    projectType,
    complexity,
    diagram: buildDiagram(projectType, complexity),
    workflowSteps,
    integrations,
  };
}

export function formatProjectAnalysisForChat(analysis: ProjectAnalysisResult): string {
  return (
    `**Listo para construir**\n\n${analysis.summary}\n\n` +
    `Pulsa **Comenzar construcción** o escribe «sí, adelante».`
  );
}
