import type { FileItem } from "@/components/ide/CodeEditor";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { deployToGithub } from "@/lib/githubDeploy";
import { getGithubUser, resolveGithubDeployTarget } from "@/lib/github-api.shared";
import {
  isValidGithubRepo,
  normalizeDeployHost,
  type GafcoreDeployResult,
} from "@/lib/gafcore-deploy.shared";
import { slugifyForGithubRepo } from "@/lib/gafcore-project-slug.shared";
import {
  isVercelAutoDeployEnabled,
  provisionVercelForGithubRepo,
} from "@/lib/vercel-deploy.server";
import { setProjectDeployStatus } from "@/lib/gafcore-deploy-status.server";
import { runDeployValidationGate } from "@/validation/integrations/deploy-gate";

export async function loadProjectFilesForUser(
  projectId: string,
  userId: string,
): Promise<FileItem[] | null> {
  const { data: project, error: pErr } = await supabaseAdmin
    .from("projects")
    .select("id, user_id, name")
    .eq("id", projectId)
    .maybeSingle();

  if (pErr || !project?.id) return null;
  if (project.user_id && project.user_id !== userId) return null;

  const { data: files, error: fErr } = await supabaseAdmin
    .from("project_files")
    .select("name, language, content")
    .eq("project_id", projectId)
    .order("name", { ascending: true });

  if (fErr) {
    console.error("[publish] load files:", fErr);
    return null;
  }

  const map = new Map<string, FileItem>();
  for (const f of (files ?? []) as FileItem[]) {
    map.set(f.name, f);
  }
  return Array.from(map.values());
}

export async function getStoredGithubToken(userId: string): Promise<string | null> {
  const platform = process.env.GAFCORE_DEPLOY_GITHUB_TOKEN?.trim();
  if (platform) return platform;

  const { data, error } = await supabaseAdmin.rpc("decrypt_user_github_token", {
    p_user_id: userId,
  });
  if (error) {
    console.error("[publish] decrypt token:", error);
    return null;
  }
  return typeof data === "string" && data.length > 0 ? data : null;
}

export async function saveGithubTokenForUser(
  userId: string,
  token: string,
  githubLogin: string,
): Promise<boolean> {
  const { data: encrypted, error: encErr } = await supabaseAdmin.rpc("encrypt_project_secret", {
    _value: token,
  });
  if (encErr || !encrypted) {
    console.error("[github-connect] encrypt:", encErr);
    return false;
  }

  const { error } = await supabaseAdmin.from("user_github_credentials").upsert({
    user_id: userId,
    token_encrypted: encrypted as string,
    github_login: githubLogin,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[github-connect] upsert:", error);
    return false;
  }
  return true;
}

export type ServerPublishInput = {
  userId: string;
  projectId: string;
  projectName: string;
  files?: FileItem[];
};

export async function publishProjectOnServer(
  input: ServerPublishInput,
): Promise<GafcoreDeployResult> {
  const token = await getStoredGithubToken(input.userId);
  if (!token) {
    return {
      ok: false,
      message:
        "Conecta GitHub en Publicar → Conectar (el token se guarda de forma segura en el servidor).",
    };
  }

  const user = await getGithubUser(token);
  if (!user) {
    return { ok: false, message: "Token de GitHub inválido. Vuelve a conectar." };
  }

  // Siempre publicar desde la copia persistida en `project_files` para evitar
  // desalineaciones con estado local del navegador.
  const files = await loadProjectFilesForUser(input.projectId, input.userId);

  if (!files || files.length === 0) {
    return { ok: false, message: "No hay archivos para publicar en este proyecto." };
  }

  const gate = await runDeployValidationGate(supabaseAdmin, {
    projectId: input.projectId,
    userId: input.userId,
    files: files.map((f) => ({ name: f.name, content: f.content })),
  });
  if (!gate.allowed) {
    return { ok: false, message: gate.message };
  }

  const { data: metaRow } = await supabaseAdmin
    .from("projects")
    .select("github_repo, github_branch, deploy_site_url, vercel_deploy_hook_url")
    .eq("id", input.projectId)
    .maybeSingle();

  const target = await resolveGithubDeployTarget(token, user.login, {
    configuredRepo: metaRow?.github_repo as string | null,
    configuredBranch: metaRow?.github_branch as string | null,
    projectName: input.projectName,
    isValidRepo: isValidGithubRepo,
    slugifyRepo: slugifyForGithubRepo,
  });
  if (!target.ok) return { ok: false, message: target.message };
  const fullRepo = target.fullName;
  const branch = target.branch;

  await supabaseAdmin
    .from("projects")
    .update({
      github_repo: fullRepo,
      github_branch: branch,
    })
    .eq("id", input.projectId);

  const r = await deployToGithub(files, { token, repo: fullRepo, branch });
  if (!r.ok) return { ok: false, message: r.message };

  let siteHost = normalizeDeployHost(metaRow?.deploy_site_url as string | null);
  let vercelNote = "";
  let deployStatus: "idle" | "building" | "ready" | "error" = "idle";
  let vercelDeploymentId: string | undefined;

  if (isVercelAutoDeployEnabled()) {
    const vercel = await provisionVercelForGithubRepo({
      fullRepo,
      branch,
      githubToken: token,
      projectName: input.projectName,
      gafcoreProjectId: input.projectId,
    });
    if (vercel.host) {
      siteHost = normalizeDeployHost(vercel.host) ?? siteHost;
      if (siteHost) {
        await supabaseAdmin
          .from("projects")
          .update({ deploy_site_url: siteHost })
          .eq("id", input.projectId);
      }
    }
    if (vercel.deploymentId) {
      vercelDeploymentId = vercel.deploymentId;
      deployStatus = vercel.deployState === "ready" ? "ready" : "building";
      await setProjectDeployStatus(input.projectId, {
        status: deployStatus,
        deploymentId: vercel.deploymentId,
        error: null,
      });
    }
    if (vercel.detail) vercelNote = ` ${vercel.detail}`;
  } else {
    const hookUrl = (metaRow?.vercel_deploy_hook_url as string | null)?.trim();
    if (hookUrl) {
      try {
        await fetch(hookUrl, { method: "POST" });
        vercelNote = " Hook de Vercel disparado.";
        deployStatus = "building";
        await setProjectDeployStatus(input.projectId, {
          status: "building",
          deploymentId: null,
          error: null,
        });
      } catch {
        /* optional */
      }
    }
  }

  const repoUrl = `https://github.com/${fullRepo}/tree/${branch}`;

  const sitePart = siteHost ? ` Sitio: https://${siteHost}.` : ` Publicado en ${fullRepo}.`;
  const extra = vercelNote.trim() ? ` ${vercelNote.trim()}` : "";
  const gateNote = gate.warning ? ` ${gate.warning}` : "";

  return {
    ok: true,
    message: `${r.message}${sitePart}${extra}${gateNote}`,
    repoUrl,
    fileCount: files.length,
    siteHost: siteHost ?? undefined,
    deployStatus,
    vercelDeploymentId,
  };
}
