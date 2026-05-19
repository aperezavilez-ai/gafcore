import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ProjectDeployStatus } from "@/lib/gafcore-deploy.shared";
import {
  fetchVercelDeployment,
  isVercelAutoDeployEnabled,
  mapVercelReadyState,
} from "@/lib/vercel-deploy.server";

export type ProjectDeployStatusRow = {
  deploy_status: ProjectDeployStatus;
  deploy_status_at: string | null;
  vercel_deployment_id: string | null;
  deploy_error: string | null;
  deploy_site_url: string | null;
  github_repo: string | null;
  github_branch: string | null;
};

export async function setProjectDeployStatus(
  projectId: string,
  patch: {
    status: ProjectDeployStatus;
    deploymentId?: string | null;
    error?: string | null;
  },
): Promise<void> {
  await supabaseAdmin
    .from("projects")
    .update({
      deploy_status: patch.status,
      deploy_status_at: new Date().toISOString(),
      vercel_deployment_id: patch.deploymentId ?? null,
      deploy_error: patch.error ?? null,
    })
    .eq("id", projectId);
}

export async function loadProjectDeployStatus(
  projectId: string,
): Promise<ProjectDeployStatusRow | null> {
  const { data, error } = await supabaseAdmin
    .from("projects")
    .select(
      "deploy_status, deploy_status_at, vercel_deployment_id, deploy_error, deploy_site_url, github_repo, github_branch",
    )
    .eq("id", projectId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    deploy_status: (data.deploy_status as ProjectDeployStatus) ?? "idle",
    deploy_status_at: data.deploy_status_at as string | null,
    vercel_deployment_id: data.vercel_deployment_id as string | null,
    deploy_error: data.deploy_error as string | null,
    deploy_site_url: data.deploy_site_url as string | null,
    github_repo: (data.github_repo as string | null) ?? null,
    github_branch: (data.github_branch as string | null) ?? null,
  };
}

/** Si está en building, consulta Vercel y actualiza la fila del proyecto. */
export async function refreshProjectDeployFromVercel(
  projectId: string,
): Promise<ProjectDeployStatusRow | null> {
  const row = await loadProjectDeployStatus(projectId);
  if (!row) return null;

  if (
    row.deploy_status !== "building" ||
    !row.vercel_deployment_id ||
    !isVercelAutoDeployEnabled()
  ) {
    return row;
  }

  const dep = await fetchVercelDeployment(row.vercel_deployment_id);
  if (!dep) return row;

  const next = mapVercelReadyState(dep.readyState ?? dep.state);
  if (next === row.deploy_status) return row;

  const errorMsg = next === "error" ? "Deploy fallido en Vercel" : null;
  await setProjectDeployStatus(projectId, {
    status: next,
    deploymentId: row.vercel_deployment_id,
    error: errorMsg,
  });

  return loadProjectDeployStatus(projectId);
}

export function extractGafcoreProjectIdFromVercelMeta(
  meta: unknown,
): string | null {
  if (!meta || typeof meta !== "object") return null;
  const id = (meta as { gafcoreProjectId?: string }).gafcoreProjectId;
  return typeof id === "string" && id.length > 10 ? id : null;
}
