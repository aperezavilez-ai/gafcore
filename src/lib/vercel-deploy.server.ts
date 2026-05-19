/**
 * Etapa 3 — Vercel automático vía VERCEL_TOKEN (solo servidor).
 * Tras push a GitHub: crea/enlaza proyecto Vercel y dispara deploy de producción.
 */

const VERCEL_API = "https://api.vercel.com";

type VercelProject = {
  id: string;
  name: string;
  link?: { type?: string; repo?: string };
};

type VercelDeployment = {
  id?: string;
  url?: string;
  alias?: string[];
  readyState?: string;
  state?: string;
};

export type VercelDeployState = "idle" | "building" | "ready" | "error";

export function mapVercelReadyState(raw: string | undefined): VercelDeployState {
  const s = (raw ?? "").toUpperCase();
  if (s === "READY") return "ready";
  if (["ERROR", "CANCELED", "CANCELLED"].includes(s)) return "error";
  if (["BUILDING", "QUEUED", "INITIALIZING", "UPLOADING"].includes(s)) return "building";
  return "building";
}

function vercelToken(): string | null {
  const t = process.env.VERCEL_TOKEN?.trim();
  return t && t.length > 8 ? t : null;
}

export function isVercelAutoDeployEnabled(): boolean {
  return Boolean(vercelToken());
}

/** Nombre de proyecto Vercel (máx. 52, minúsculas, guiones). */
export function slugifyForVercelProject(projectName: string, fullRepo?: string): string {
  const fromRepo = fullRepo?.includes("/") ? fullRepo.split("/")[1] : "";
  const raw = (fromRepo || projectName || "gafcore-app")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const slug = raw.slice(0, 52) || "gafcore-app";
  return slug.replace(/^-+|-+$/g, "") || "gafcore-app";
}

function apiPath(path: string): string {
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  if (!teamId) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}teamId=${encodeURIComponent(teamId)}`;
}

async function vercelFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; status: number; detail: string }> {
  const token = vercelToken();
  if (!token) return { ok: false, status: 0, detail: "VERCEL_TOKEN no configurado" };

  const res = await fetch(`${VERCEL_API}${apiPath(path)}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string>),
    },
  });

  const text = await res.text().catch(() => "");
  let json: T | { error?: { message?: string } } = {} as T;
  try {
    json = text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    /* */
  }

  if (!res.ok) {
    const msg =
      (json as { error?: { message?: string } })?.error?.message ||
      text.slice(0, 300) ||
      `HTTP ${res.status}`;
    return { ok: false, status: res.status, detail: msg };
  }
  return { ok: true, data: json as T };
}

export async function getGithubRepoNumericId(
  githubToken: string,
  fullRepo: string,
): Promise<number | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${fullRepo}`, {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { id?: number };
    return typeof j.id === "number" ? j.id : null;
  } catch {
    return null;
  }
}

async function findVercelProjectByName(name: string): Promise<VercelProject | null> {
  const r = await vercelFetch<{ projects?: VercelProject[] }>("/v9/projects");
  if (!r.ok) return null;
  return (r.data.projects ?? []).find((p) => p.name === name) ?? null;
}

async function getVercelProjectByName(name: string): Promise<VercelProject | null> {
  const r = await vercelFetch<VercelProject>(`/v9/projects/${encodeURIComponent(name)}`);
  if (r.ok) return r.data;
  return findVercelProjectByName(name);
}

async function createVercelProject(name: string, fullRepo: string): Promise<VercelProject | null> {
  const r = await vercelFetch<VercelProject>("/v11/projects", {
    method: "POST",
    body: JSON.stringify({
      name,
      framework: "vite",
      buildCommand: "npm run build",
      outputDirectory: "dist",
      installCommand: "npm install",
      gitRepository: {
        type: "github",
        repo: fullRepo,
      },
    }),
  });
  if (r.ok) return r.data;

  if (r.status === 409 || /already exists|duplicate/i.test(r.detail)) {
    return getVercelProjectByName(name);
  }
  console.error("[vercel] create project:", r.detail);
  return null;
}

async function ensureVercelProject(
  vercelName: string,
  fullRepo: string,
): Promise<VercelProject | null> {
  const existing = await getVercelProjectByName(vercelName);
  if (existing?.id) return existing;
  return createVercelProject(vercelName, fullRepo);
}

async function triggerProductionDeploy(
  project: VercelProject,
  repoId: number,
  branch: string,
  gafcoreProjectId?: string,
): Promise<VercelDeployment | null> {
  const r = await vercelFetch<VercelDeployment>("/v13/deployments", {
    method: "POST",
    body: JSON.stringify({
      name: project.name,
      project: project.id,
      target: "production",
      meta: gafcoreProjectId ? { gafcoreProjectId } : undefined,
      gitSource: {
        type: "github",
        ref: branch,
        repoId,
      },
    }),
  });
  if (!r.ok) {
    console.error("[vercel] deploy:", r.detail);
    return null;
  }
  return r.data;
}

/** Host de producción típico (*.vercel.app). */
export function defaultVercelProductionHost(projectName: string): string {
  return `${projectName}.vercel.app`;
}

export type VercelProvisionResult = {
  ok: boolean;
  host: string | null;
  detail?: string;
  deploymentUrl?: string;
  deploymentId?: string;
  deployState?: VercelDeployState;
};

/**
 * Crea o reutiliza proyecto Vercel, dispara deploy y devuelve hostname para deploy_site_url.
 */
export async function fetchVercelDeployment(deploymentId: string): Promise<VercelDeployment | null> {
  const r = await vercelFetch<VercelDeployment>(`/v13/deployments/${encodeURIComponent(deploymentId)}`);
  if (!r.ok) return null;
  return r.data;
}

export async function provisionVercelForGithubRepo(input: {
  fullRepo: string;
  branch: string;
  githubToken: string;
  projectName: string;
  gafcoreProjectId?: string;
}): Promise<VercelProvisionResult> {
  if (!isVercelAutoDeployEnabled()) {
    return { ok: false, host: null, detail: "VERCEL_TOKEN no configurado" };
  }

  const vercelName = slugifyForVercelProject(input.projectName, input.fullRepo);
  const project = await ensureVercelProject(vercelName, input.fullRepo);
  if (!project?.id) {
    return {
      ok: false,
      host: null,
      detail:
        "No se pudo crear el proyecto en Vercel. Comprueba VERCEL_TOKEN y que GitHub esté conectado en vercel.com.",
    };
  }

  const repoId = await getGithubRepoNumericId(input.githubToken, input.fullRepo);
  const host = defaultVercelProductionHost(project.name);

  if (!repoId) {
    return {
      ok: true,
      host,
      detail: "Proyecto Vercel enlazado; no se pudo disparar deploy (id de repo GitHub).",
    };
  }

  const deployment = await triggerProductionDeploy(
    project,
    repoId,
    input.branch,
    input.gafcoreProjectId,
  );
  const deploymentUrl = deployment?.url
    ? deployment.url.startsWith("http")
      ? deployment.url
      : `https://${deployment.url}`
    : undefined;
  const deployState = mapVercelReadyState(deployment?.readyState ?? deployment?.state);

  return {
    ok: true,
    host,
    deploymentUrl,
    deploymentId: deployment?.id,
    deployState: deployment?.id ? deployState : undefined,
    detail: deployment
      ? "Deploy de Vercel iniciado."
      : "Proyecto Vercel enlazado; revisa el panel de Vercel si el deploy no arranca.",
  };
}
