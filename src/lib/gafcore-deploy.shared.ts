import { getIdeConfig } from "@/lib/ideConfig";

const GITHUB_REPO_PLACEHOLDERS = new Set([
  "usuario/mi-app",
  "user/mi-app",
  "owner/repo",
  "tu-usuario/mi-app",
  "tu-usuario/mi-tienda",
]);

/** Repo real `owner/name`, no texto de ejemplo del formulario. */
export function isValidGithubRepo(repo: string | null | undefined): boolean {
  const r = repo?.trim() ?? "";
  if (!/^[\w.-]+\/[\w.-]+$/i.test(r)) return false;
  if (GITHUB_REPO_PLACEHOLDERS.has(r.toLowerCase())) return false;
  return true;
}

const SERVER_GH_KEY = "gafcore.github.serverConnected";

export function markGithubServerConnected(): void {
  try {
    localStorage.setItem(SERVER_GH_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function isGithubServerConnected(): boolean {
  try {
    return localStorage.getItem(SERVER_GH_KEY) === "1";
  } catch {
    return false;
  }
}

/** Token local o GitHub ya conectado en servidor (Etapa 2). */
export function isGithubDeployConfigured(): boolean {
  const c = getIdeConfig();
  return Boolean(c.githubToken?.trim()) || isGithubServerConnected();
}

export function isGafcoreProductionHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return host === "gafcore.com" || host.endsWith(".gafcore.com");
}

/** Resultado del flujo Publicar (GitHub + hook opcional). */
export type ProjectDeployStatus = "idle" | "building" | "ready" | "error";

export type GafcoreDeployResult = {
  ok: boolean;
  message: string;
  repoUrl?: string;
  fileCount?: number;
  /** Hostname para verificación HTTP (sin protocolo). */
  siteHost?: string;
  commitHint?: string;
  deployStatus?: ProjectDeployStatus;
  vercelDeploymentId?: string;
};

/** Hosts que no son el sitio del usuario (plataforma GafCore, local, etc.). */
export function isBlockedDeployHost(host: string | null | undefined): boolean {
  const h = (host ?? "").trim().toLowerCase();
  if (!h) return false;
  if (h === "gafcore.com" || h.endsWith(".gafcore.com")) return true;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.startsWith("127.") || h === "0.0.0.0") return true;
  return false;
}

export function normalizeDeployHost(input: string | null | undefined): string | null {
  if (!input?.trim()) return null;
  let s = input.trim();
  s = s.replace(/^https?:\/\//i, "");
  s = s.replace(/\/+$/, "");
  const host = s.split("/")[0] ?? "";
  if (!host || isBlockedDeployHost(host)) return null;
  return host;
}

export function deployHostFromGithubRepo(repo: string): string | null {
  const r = repo.trim();
  if (!r.includes("/")) return null;
  return `${r.split("/")[0]}.github.io`;
}
