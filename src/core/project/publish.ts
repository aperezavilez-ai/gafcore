import type { FileItem } from "@/components/ide/CodeEditor";
import { deployToGithub } from "@/lib/githubDeploy";
import { getGithubUser, resolveGithubDeployTarget } from "@/lib/github-api.shared";
import { publishProjectOnServerApi } from "@/lib/gafcore-api";
import {
  isGafcoreProductionHost,
  isValidGithubRepo,
  normalizeDeployHost,
  type GafcoreDeployResult,
} from "@/lib/gafcore-deploy.shared";
import { slugifyForGithubRepo } from "@/lib/gafcore-project-slug.shared";
import { getIdeConfig, setIdeConfig } from "@/lib/ideConfig";
import { getProjectDeployMeta, saveProjectDeployMeta } from "./project-service";

export type AutoPublishInput = {
  projectId: string;
  projectName: string;
  files: FileItem[];
  secrets?: { name: string; value: string }[];
  approvalId?: string;
};

/**
 * Publicar: intenta servidor (Etapa 2) y si falla usa token local (fallback).
 */
export async function autoPublishProject(input: AutoPublishInput): Promise<GafcoreDeployResult> {
  if (typeof window !== "undefined") {
    const server = await publishProjectOnServerApi({
      projectId: input.projectId,
      projectName: input.projectName,
      files: input.files,
      approvalId: input.approvalId,
    });
    if (server.ok) return server;
    if (isGafcoreProductionHost() && !getIdeConfig().githubToken?.trim()) {
      return server;
    }
  }

  return autoPublishProjectClient(input);
}

async function autoPublishProjectClient(input: AutoPublishInput): Promise<GafcoreDeployResult> {
  const cfg = getIdeConfig();
  const token = cfg.githubToken?.trim();
  if (!token) {
    return {
      ok: false,
      message: "Conecta GitHub una vez (token con permiso repo) en Publicar → Conectar.",
    };
  }

  const user = await getGithubUser(token);
  if (!user) {
    return {
      ok: false,
      message: "Token de GitHub inválido o caducado. Genera uno nuevo y vuelve a conectar.",
    };
  }

  const meta = await getProjectDeployMeta(input.projectId);
  const target = await resolveGithubDeployTarget(token, user.login, {
    configuredRepo: meta?.github_repo ?? cfg.githubRepo,
    configuredBranch: meta?.github_branch ?? cfg.githubBranch,
    projectName: input.projectName,
    isValidRepo: isValidGithubRepo,
    slugifyRepo: slugifyForGithubRepo,
  });
  if (!target.ok) {
    return { ok: false, message: target.message };
  }
  const fullRepo = target.fullName;
  const branch = target.branch;

  setIdeConfig({
    ...cfg,
    githubToken: token,
    githubRepo: fullRepo,
    githubBranch: branch,
  });

  await saveProjectDeployMeta(input.projectId, {
    github_repo: fullRepo,
    github_branch: branch,
  });

  const excludeEnv = cfg.githubExcludeEnv !== false;
  const filesToDeploy = [...input.files];
  if (input.secrets?.length && !excludeEnv) {
    const envContent =
      "# Generado por GafCore\n" +
      input.secrets.map((s) => `${s.name}=${JSON.stringify(s.value)}`).join("\n") +
      "\n";
    filesToDeploy.push({ name: ".env", language: "plaintext", content: envContent });
  }

  const r = await deployToGithub(filesToDeploy, { token, repo: fullRepo, branch });
  if (!r.ok) {
    return { ok: false, message: r.message };
  }

  const hookUrl = (meta?.vercel_deploy_hook_url ?? cfg.vercelDeployHookUrl)?.trim();
  if (hookUrl) {
    try {
      await fetch(hookUrl, { method: "POST" });
    } catch {
      /* hook opcional */
    }
  }

  const siteHost = normalizeDeployHost(meta?.deploy_site_url ?? cfg.deploySiteUrl);
  const repoUrl = `https://github.com/${fullRepo}/tree/${branch}`;

  return {
    ok: true,
    message: siteHost
      ? `${r.message} Sitio: https://${siteHost}`
      : `${r.message} Repo: ${fullRepo}. GafCore activará Vercel automáticamente cuando esté disponible en tu cuenta.`,
    repoUrl,
    fileCount: filesToDeploy.length,
    siteHost: siteHost ?? undefined,
  };
}
