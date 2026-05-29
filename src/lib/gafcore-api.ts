import { getAuthAccessToken } from "@/hooks/useAuth";
import type { GafcoreDeployResult } from "@/lib/gafcore-deploy.shared";

async function authHeaders(): Promise<Headers> {
  const headers = new Headers({ "Content-Type": "application/json" });
  const token = await getAuthAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

/** Guarda PAT en servidor (cifrado). */
export async function connectGithubOnServer(token: string): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch("/api/gafcore/github-connect", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ token }),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
  if (!res.ok) {
    return { ok: false, message: data.message ?? data.error ?? `HTTP ${res.status}` };
  }
  return { ok: true };
}

/** Publica vía servidor (lee archivos en Supabase). */
export async function publishProjectOnServerApi(input: {
  projectId: string;
  projectName: string;
  files?: { name: string; language: string; content: string }[];
  approvalId?: string;
}): Promise<GafcoreDeployResult> {
  const res = await fetch("/api/gafcore/publish", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(input),
  });
  const data = (await res.json().catch(() => ({}))) as GafcoreDeployResult & { message?: string };
  if (!res.ok && !data.ok) {
    return { ok: false, message: data.message ?? `HTTP ${res.status}` };
  }
  return data;
}
