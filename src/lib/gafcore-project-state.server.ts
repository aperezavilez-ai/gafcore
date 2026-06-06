import {
  createEmptyOrchestrationState,
  type ProjectOrchestrationState,
} from "@/core/orchestration/project-state.shared";
import { getStoredGithubToken } from "@/lib/github-publish.server";
import {
  isValidGithubRepo,
  normalizeDeployHost,
} from "@/lib/gafcore-deploy.shared";
import {
  loadProjectDeployStatus,
  refreshProjectDeployFromVercel,
} from "@/lib/gafcore-deploy-status.server";
import { verifyDeploySiteHost } from "@/lib/gafcore-site-verify.server";
import { loadWorkflowPayload, saveWorkflowPayload } from "@/tasks/workflow-files.server";

export type DeploymentVerificationResult = {
  ok: boolean;
  githubOk: boolean;
  vercelOk: boolean;
  siteOk: boolean | null;
  previewOk: boolean;
  message: string;
  guidance: string[];
  state: ProjectOrchestrationState;
};

export async function buildProjectOrchestrationState(
  projectId: string,
  userId: string,
  workflowRunId?: string | null,
  previewOverride?: { ok: boolean; lastError: string | null },
): Promise<ProjectOrchestrationState> {
  const now = new Date().toISOString();
  let base = createEmptyOrchestrationState(workflowRunId ?? null);

  if (workflowRunId) {
    const payload = await loadWorkflowPayload(workflowRunId);
    if (payload.orchestrationState?.version === 1) {
      base = { ...base, ...payload.orchestrationState, workflowRunId };
    }
  }

  let preview = base.preview;
  if (previewOverride) {
    preview = {
      ok: previewOverride.ok,
      lastError: previewOverride.lastError,
      updatedAt: now,
    };
  }

  let deployRow = await loadProjectDeployStatus(projectId);
  if (deployRow?.deploy_status === "building") {
    deployRow = (await refreshProjectDeployFromVercel(projectId)) ?? deployRow;
  }

  const token = await getStoredGithubToken(userId);
  const githubRepo = deployRow?.github_repo ?? null;
  const githubConfigured = Boolean(token) && isValidGithubRepo(githubRepo);
  const siteHost = normalizeDeployHost(deployRow?.deploy_site_url);
  const vercelStatus = deployRow?.deploy_status ?? "idle";

  let siteReachable: boolean | null = null;
  if (siteHost && vercelStatus === "ready") {
    const verify = await verifyDeploySiteHost(siteHost);
    siteReachable = verify.ok;
  }

  return {
    version: 1,
    workflowRunId: workflowRunId ?? base.workflowRunId,
    preview,
    deploy: {
      githubConfigured,
      githubRepo,
      vercelStatus,
      siteHost,
      siteReachable,
      deployError: deployRow?.deploy_error ?? null,
      updatedAt: now,
    },
  };
}

export async function persistProjectOrchestrationState(
  workflowRunId: string,
  state: ProjectOrchestrationState,
): Promise<void> {
  await saveWorkflowPayload(workflowRunId, { orchestrationState: state });
}

export async function verifyProjectDeploymentIntegrations(
  projectId: string,
  userId: string,
  workflowRunId?: string | null,
  previewOverride?: { ok: boolean; lastError: string | null },
): Promise<DeploymentVerificationResult> {
  const state = await buildProjectOrchestrationState(
    projectId,
    userId,
    workflowRunId,
    previewOverride,
  );

  const githubOk = state.deploy.githubConfigured;
  const previewOk = state.preview.ok;
  const vercelOk = state.deploy.vercelStatus === "ready";
  const siteOk = state.deploy.siteReachable;

  const guidance: string[] = [];
  if (!previewOk) guidance.push("Corrige el preview antes de desplegar.");
  if (!githubOk) guidance.push("Conecta GitHub (Ajustes del proyecto o Publicar).");
  if (!vercelOk) guidance.push("Usa Publicar para desplegar en Vercel.");
  if (siteOk === false && state.deploy.siteHost) {
    guidance.push(`El sitio ${state.deploy.siteHost} no respondió correctamente.`);
  }

  const ok = previewOk && githubOk && vercelOk && siteOk === true;
  const message = ok
    ? "Integraciones listas: GitHub, Vercel y sitio verificados."
    : guidance[0] ?? "Configura GitHub y Vercel para completar el paso de despliegue.";

  if (workflowRunId) {
    await persistProjectOrchestrationState(workflowRunId, state);
  }

  return {
    ok,
    githubOk,
    vercelOk,
    siteOk,
    previewOk,
    message,
    guidance,
    state,
  };
}
