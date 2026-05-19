import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  loadProjectDeployStatus,
  refreshProjectDeployFromVercel,
} from "@/lib/gafcore-deploy-status.server";
import type { ProjectDeployStatus } from "@/lib/gafcore-deploy.shared";
import { verifyDeploySiteHost } from "@/lib/gafcore-site-verify.server";

export const getProjectDeployStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ projectId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase!;
    const { data: project } = await sb
      .from("projects")
      .select("id, user_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project?.id) {
      return { status: "idle" as ProjectDeployStatus };
    }
    if (project.user_id && project.user_id !== context.userId) {
      return { status: "idle" as ProjectDeployStatus };
    }

    const row = await refreshProjectDeployFromVercel(data.projectId);
    if (!row) {
      return { status: "idle" as ProjectDeployStatus };
    }

    return {
      status: row.deploy_status,
      updatedAt: row.deploy_status_at,
      deploymentId: row.vercel_deployment_id,
      error: row.deploy_error,
      siteHost: row.deploy_site_url,
      githubRepo: row.github_repo,
      githubBranch: row.github_branch,
    };
  });

export const verifyDeploySite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ host: z.string().min(1).max(500), projectId: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.projectId) {
      const sb = context.supabase!;
      const { data: project } = await sb
        .from("projects")
        .select("user_id")
        .eq("id", data.projectId)
        .maybeSingle();
      if (project?.user_id && project.user_id !== context.userId) {
        return { ok: false, error: "forbidden" };
      }
    }
    return verifyDeploySiteHost(data.host);
  });
