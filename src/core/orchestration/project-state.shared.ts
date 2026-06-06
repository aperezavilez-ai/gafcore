/**
 * Estado unificado del proyecto (Fase 4): workflow + preview + deploy.
 */
import type { ProjectDeployStatus } from "@/lib/gafcore-deploy.shared";

export type ProjectOrchestrationPreviewState = {
  ok: boolean;
  lastError: string | null;
  updatedAt: string;
};

export type ProjectOrchestrationDeployState = {
  githubConfigured: boolean;
  githubRepo: string | null;
  vercelStatus: ProjectDeployStatus;
  siteHost: string | null;
  siteReachable: boolean | null;
  deployError: string | null;
  updatedAt: string;
};

export type ProjectOrchestrationState = {
  version: 1;
  workflowRunId: string | null;
  preview: ProjectOrchestrationPreviewState;
  deploy: ProjectOrchestrationDeployState;
};

export function createEmptyOrchestrationState(workflowRunId: string | null): ProjectOrchestrationState {
  const now = new Date().toISOString();
  return {
    version: 1,
    workflowRunId,
    preview: { ok: true, lastError: null, updatedAt: now },
    deploy: {
      githubConfigured: false,
      githubRepo: null,
      vercelStatus: "idle",
      siteHost: null,
      siteReachable: null,
      deployError: null,
      updatedAt: now,
    },
  };
}

export function formatOrchestrationStatusLine(state: ProjectOrchestrationState | null): string | null {
  if (!state) return null;
  const parts: string[] = [];
  parts.push(state.preview.ok ? "Preview ✔" : "Preview ⚠");
  parts.push(state.deploy.githubConfigured ? "GitHub ✔" : "GitHub ⬜");
  if (state.deploy.vercelStatus === "ready" && state.deploy.siteReachable) {
    parts.push("Deploy ✔");
  } else if (state.deploy.vercelStatus === "building") {
    parts.push("Deploy 🔄");
  } else if (state.deploy.vercelStatus === "error") {
    parts.push("Deploy ⚠");
  } else {
    parts.push("Deploy ⬜");
  }
  return parts.join(" · ");
}

export function deploymentStepGuidance(state: ProjectOrchestrationState): string[] {
  const steps: string[] = [];
  if (!state.deploy.githubConfigured) {
    steps.push("Conecta GitHub en Ajustes del proyecto o Publicar");
  }
  if (state.deploy.vercelStatus !== "ready") {
    steps.push("Publica con el botón Publicar (Vercel) cuando el preview esté OK");
  }
  if (state.deploy.siteHost && state.deploy.siteReachable === false) {
    steps.push(`Verifica que ${state.deploy.siteHost} responda en el navegador`);
  }
  if (!state.preview.ok) {
    steps.push("Corrige el preview antes de desplegar");
  }
  return steps;
}

export function isDeploymentStepReady(state: ProjectOrchestrationState): boolean {
  return (
    state.preview.ok &&
    state.deploy.githubConfigured &&
    state.deploy.vercelStatus === "ready" &&
    state.deploy.siteReachable === true
  );
}

/** Permite marcar deployment parcial si GitHub está listo aunque Vercel aún no. */
export function isDeploymentStepPartiallyReady(state: ProjectOrchestrationState): boolean {
  return state.preview.ok && state.deploy.githubConfigured;
}
