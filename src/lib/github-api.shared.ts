const API = "https://api.github.com";

export type GithubUser = { login: string; id: number };

async function gh(token: string, path: string, init: RequestInit = {}) {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

export async function getGithubUser(token: string): Promise<GithubUser | null> {
  const res = await gh(token, "/user");
  if (!res.ok) return null;
  const j = (await res.json()) as { login?: string; id?: number };
  if (!j.login) return null;
  return { login: j.login, id: j.id ?? 0 };
}

/** Crea el repo si no existe. Devuelve `owner/repo`. */
export async function ensureGithubRepo(
  token: string,
  owner: string,
  repoName: string,
): Promise<{ ok: boolean; fullName: string; created: boolean; message: string }> {
  const fullName = `${owner}/${repoName}`;
  const check = await gh(token, `/repos/${fullName}`);
  if (check.ok) {
    return { ok: true, fullName, created: false, message: "Repo listo" };
  }
  if (check.status !== 404) {
    const t = await check.text();
    return { ok: false, fullName, created: false, message: `GitHub ${check.status}: ${t.slice(0, 120)}` };
  }

  const create = await gh(token, "/user/repos", {
    method: "POST",
    body: JSON.stringify({
      name: repoName,
      private: false,
      auto_init: true,
      description: "Publicado desde GafCore",
    }),
  });
  if (!create.ok) {
    const t = await create.text();
    return { ok: false, fullName, created: false, message: `No se pudo crear el repo: ${create.status} ${t.slice(0, 120)}` };
  }
  return { ok: true, fullName, created: true, message: `Repo creado: ${fullName}` };
}

export async function githubRepoExists(
  token: string,
  fullName: string,
  branch = "main",
): Promise<boolean> {
  const repoRes = await gh(token, `/repos/${fullName}`);
  if (!repoRes.ok) return false;
  const branchRes = await gh(token, `/repos/${fullName}/branches/${encodeURIComponent(branch)}`);
  return branchRes.ok;
}

export type GithubDeployTarget = {
  ok: boolean;
  fullName: string;
  branch: string;
  message: string;
  created?: boolean;
  resetRepo?: boolean;
};

/** Repo/rama válidos para push; si el configurado no existe, crea uno nuevo del proyecto. */
export async function resolveGithubDeployTarget(
  token: string,
  ownerLogin: string,
  opts: {
    configuredRepo?: string | null;
    configuredBranch?: string | null;
    projectName: string;
    isValidRepo: (repo: string | null | undefined) => boolean;
    slugifyRepo: (projectName: string, login: string) => string;
  },
): Promise<GithubDeployTarget> {
  const branch = (opts.configuredBranch ?? "main").trim() || "main";
  const configured = opts.configuredRepo?.trim() ?? "";

  if (opts.isValidRepo(configured)) {
    const exists = await githubRepoExists(token, configured, branch);
    if (exists) {
      return { ok: true, fullName: configured, branch, message: "Repo listo" };
    }
  }

  const repoName = opts.slugifyRepo(opts.projectName, ownerLogin);
  const ensured = await ensureGithubRepo(token, ownerLogin, repoName);
  if (!ensured.ok) {
    return { ok: false, fullName: ensured.fullName, branch, message: ensured.message };
  }
  if (ensured.created) {
    await new Promise((r) => setTimeout(r, 1200));
  }

  return {
    ok: true,
    fullName: ensured.fullName,
    branch,
    message: ensured.message,
    created: ensured.created,
    resetRepo: Boolean(configured && opts.isValidRepo(configured)),
  };
}
