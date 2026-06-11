import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { FileItem } from "@/components/ide/CodeEditor";
import { normalizeSnapshotFiles } from "@/lib/gafcore-snapshot-restore.shared";
import { logPipelineEvent } from "@/lib/gafcore-pipeline-telemetry.shared";
import { supabase as defaultSupabase } from "@/integrations/supabase/client";

export type SaveProjectFilesResult =
  | { ok: true }
  | { ok: false; reason: "no_client" | "no_project" | "delete_failed" | "insert_failed"; detail?: string };

const CFG_KEY = "ide.supabase.config";
const PROJECT_KEY = "ide.project.id";

let cached: { url: string; key: string; client: SupabaseClient } | null = null;
let projectSaveSuppressed = false;

/** Cola por proyecto: evita DELETE+INSERT intercalados que corrompen project_files. */
const projectSaveQueue = new Map<string, Promise<SaveProjectFilesResult>>();
/** Generación monotónica: descarta saves obsoletos aún en cola. */
const projectSaveGeneration = new Map<string, number>();

function allocateProjectSaveGeneration(projectId: string): number {
  const next = (projectSaveGeneration.get(projectId) ?? 0) + 1;
  projectSaveGeneration.set(projectId, next);
  return next;
}

function isProjectSaveGenerationStale(projectId: string, generation: number): boolean {
  return (projectSaveGeneration.get(projectId) ?? 0) !== generation;
}

function runSerializedProjectSave(
  projectId: string,
  task: () => Promise<SaveProjectFilesResult>,
): Promise<SaveProjectFilesResult> {
  const prev = projectSaveQueue.get(projectId) ?? Promise.resolve({ ok: true as const });
  const run = prev
    .catch(() => ({ ok: true as const }))
    .then(task);
  projectSaveQueue.set(
    projectId,
    run.catch(() => ({ ok: false as const, reason: "insert_failed" as const })),
  );
  return run;
}

/** Evita escrituras a project_files durante cierre de sesión (RLS sin auth). */
export function setProjectSaveSuppressed(value: boolean) {
  projectSaveSuppressed = value;
}

async function hasActiveAuthSession(sb: SupabaseClient): Promise<boolean> {
  const { data } = await sb.auth.getSession();
  return !!data.session?.access_token;
}

function isRlsAuthError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return m.includes("row-level security") || m.includes("jwt");
}

export function getUserSupabase(): SupabaseClient | null {
  try {
    if (typeof window !== "undefined") {
      const host = window.location.hostname.toLowerCase();
      // En producción de GafCore no se debe usar config local legacy,
      // porque puede apuntar a otro proyecto y romper guardado por RLS.
      if (host === "gafcore.com" || host.endsWith(".gafcore.com")) {
        localStorage.removeItem(CFG_KEY);
        return defaultSupabase as unknown as SupabaseClient;
      }
    }
    const cfg = JSON.parse(localStorage.getItem(CFG_KEY) ?? "{}");
    if (!cfg.url || !cfg.apiKey) {
      // Fallback al proyecto Supabase configurado en variables de entorno
      return defaultSupabase as unknown as SupabaseClient;
    }
    if (cached && cached.url === cfg.url && cached.key === cfg.apiKey) {
      return cached.client;
    }
    const client = createClient(cfg.url, cfg.apiKey, {
      auth: { persistSession: false },
    });
    cached = { url: cfg.url, key: cfg.apiKey, client };
    return client;
  } catch {
    return defaultSupabase as unknown as SupabaseClient;
  }
}

/** Versión async de getUserSupabase — en gafcore.com usa el cliente dinámico con JWT activo. */
export async function getUserSupabaseAsync(): Promise<SupabaseClient | null> {
  if (typeof window !== "undefined") {
    const host = window.location.hostname.toLowerCase();
    if (host === "gafcore.com" || host.endsWith(".gafcore.com")) {
      try {
        const { getGafcoreSupabaseBrowser } = await import("@/lib/gafcore-supabase-browser");
        return (await getGafcoreSupabaseBrowser()) as unknown as SupabaseClient;
      } catch {
        return defaultSupabase as unknown as SupabaseClient;
      }
    }
  }
  return getUserSupabase();
}

export async function ensureProjectId(): Promise<string | null> {
  const sb = await getUserSupabaseAsync();
  if (!sb) return null;

  // Validate cached id actually exists in the projects table
  const cachedId = localStorage.getItem(PROJECT_KEY);
  if (cachedId) {
    const { data: check } = await sb.from("projects").select("id").eq("id", cachedId).maybeSingle();
    if (check?.id) return check.id as string;
    // Stale cache — clear and continue
    localStorage.removeItem(PROJECT_KEY);
  }

  // Si no hay caché válida, enlazar al proyecto más reciente del usuario (RLS).
  // No insertar proyectos aquí: el usuario crea con «+ Nuevo» o importación.
  const { data: existing } = await sb
    .from("projects")
    .select("id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    localStorage.setItem(PROJECT_KEY, existing.id);
    return existing.id as string;
  }

  return null;
}

export type ProjectRow = { id: string; name: string; created_at?: string; updated_at?: string; deploy_site_url?: string | null; github_repo?: string | null; };

/** Espera a que la sesión Supabase esté lista (RLS requiere JWT). */
async function waitForAuthSession(
  sb: NonNullable<ReturnType<typeof getUserSupabase>>,
  maxMs = 12_000,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const { data } = await sb.auth.getSession();
    if (data.session?.access_token) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

export async function listProjects(): Promise<ProjectRow[]> {
  const sb = await getUserSupabaseAsync();
  if (!sb) return [];
  await waitForAuthSession(sb);

  const query = async (select: string, orderCol: string) =>
    sb
      .from("projects")
      .select(select)
      .order(orderCol, { ascending: false, nullsFirst: false });

  let { data, error } = await query(
    "id, name, created_at, updated_at, deploy_site_url, github_repo",
    "updated_at",
  );
  if (error) {
    console.error("[Supabase] list projects error:", error);
    const fallback = await query("id, name, created_at, updated_at", "created_at");
    if (fallback.error) {
      console.error("[Supabase] list projects fallback error:", fallback.error);
      return [];
    }
    data = fallback.data;
  }

  const rows = (data ?? []) as ProjectRow[];
  if (rows.length > 0) return rows;

  // Reintento breve: proyecto recién creado puede no aparecer al instante
  await new Promise((r) => setTimeout(r, 400));
  const retry = await query("id, name, created_at, updated_at", "created_at");
  if (!retry.error && retry.data?.length) {
    return retry.data as ProjectRow[];
  }
  return rows;
}

export async function createProject(name: string): Promise<ProjectRow | null> {
  const sb = await getUserSupabaseAsync();
  if (!sb) return null;
  const { data: userRes } = await sb.auth.getUser();
  const userId = userRes?.user?.id;
  const payload: Record<string, unknown> = { name };
  if (userId) payload.user_id = userId;
  const { data, error } = await sb
    .from("projects")
    .insert(payload)
    .select("id, name, created_at")
    .single();
  if (error || !data) {
    console.error("[Supabase] create project error:", error);
    return null;
  }
  return data as ProjectRow;
}

export async function renameProject(id: string, name: string): Promise<boolean> {
  const sb = await getUserSupabaseAsync();
  if (!sb) return false;
  const { error } = await sb.from("projects").update({ name }).eq("id", id);
  if (error) {
    console.error("[Supabase] rename project error:", error);
    return false;
  }
  return true;
}

export type ProjectDeployMeta = {
  github_repo: string | null;
  github_branch: string | null;
  deploy_site_url: string | null;
  vercel_deploy_hook_url: string | null;
};

export async function getProjectDeployMeta(
  projectId?: string | null,
): Promise<ProjectDeployMeta | null> {
  const sb = await getUserSupabaseAsync();
  if (!sb) return null;
  const id = projectId ?? (await ensureProjectId());
  if (!id) return null;
  const { data, error } = await sb
    .from("projects")
    .select("github_repo, github_branch, deploy_site_url, vercel_deploy_hook_url")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[Supabase] getProjectDeployMeta error:", error);
    return null;
  }
  const row = data as Record<string, unknown>;
  return {
    github_repo: (row.github_repo as string | null) ?? null,
    github_branch: (row.github_branch as string | null) ?? "main",
    deploy_site_url: (row.deploy_site_url as string | null) ?? null,
    vercel_deploy_hook_url: (row.vercel_deploy_hook_url as string | null) ?? null,
  };
}

export async function saveProjectDeployMeta(
  projectId: string,
  meta: {
    github_repo?: string | null;
    github_branch?: string | null;
    deploy_site_url?: string | null;
    vercel_deploy_hook_url?: string | null;
  },
): Promise<boolean> {
  const sb = await getUserSupabaseAsync();
  if (!sb) return false;
  const patch: Record<string, unknown> = {};
  if (meta.github_repo !== undefined) patch.github_repo = meta.github_repo?.trim() || null;
  if (meta.github_branch !== undefined) patch.github_branch = meta.github_branch?.trim() || "main";
  if (meta.deploy_site_url !== undefined) patch.deploy_site_url = meta.deploy_site_url?.trim() || null;
  if (meta.vercel_deploy_hook_url !== undefined) {
    patch.vercel_deploy_hook_url = meta.vercel_deploy_hook_url?.trim() || null;
  }
  const { error } = await sb.from("projects").update(patch).eq("id", projectId);
  if (error) {
    console.error("[Supabase] saveProjectDeployMeta error:", error);
    return false;
  }
  return true;
}

export function getCurrentProjectId(): string | null {
  try {
    return localStorage.getItem(PROJECT_KEY);
  } catch {
    return null;
  }
}

export function setCurrentProjectId(id: string) {
  try {
    localStorage.setItem(PROJECT_KEY, id);
  } catch {}
}

export function clearCurrentProjectId() {
  try {
    localStorage.removeItem(PROJECT_KEY);
  } catch {}
}

export async function loadProjectFiles(
  explicitProjectId?: string | null,
): Promise<FileItem[] | null> {
  const sb = await getUserSupabaseAsync();
  if (!sb) return null;
  let projectId = explicitProjectId?.trim() || null;
  if (!projectId) projectId = await ensureProjectId();
  if (!projectId) return null;

  const { data, error } = await sb
    .from("project_files")
    .select("name, language, content")
    .eq("project_id", projectId)
    .order("name", { ascending: true });

  if (error) {
    console.error("[Supabase] load files error:", error);
    return null;
  }
  if (!data || data.length === 0) return [];
  // Dedupe by name (keep last occurrence)
  const map = new Map<string, FileItem>();
  for (const f of data as FileItem[]) map.set(f.name, f);
  return Array.from(map.values());
}

export async function saveProjectFiles(
  files: FileItem[],
  explicitProjectId?: string | null,
): Promise<boolean> {
  const result = await saveProjectFilesDetailed(files, explicitProjectId);
  return result.ok;
}

/** Inserta o actualiza un solo archivo sin borrar el resto del proyecto. */
export async function upsertSingleProjectFile(
  projectId: string,
  file: FileItem,
): Promise<{ ok: boolean; detail?: string }> {
  const sb = await getUserSupabaseAsync();
  if (!sb) return { ok: false, detail: "no_client" };
  if (projectSaveSuppressed || !(await hasActiveAuthSession(sb))) return { ok: true };

  const { data: owned } = await sb.from("projects").select("id").eq("id", projectId).maybeSingle();
  if (!owned?.id) return { ok: false, detail: "project_not_visible" };

  const { error } = await sb.from("project_files").upsert(
    {
      project_id: projectId,
      name: file.name,
      language: file.language ?? "plaintext",
      content: file.content,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id,name" },
  );
  if (error) {
    if (projectSaveSuppressed || isRlsAuthError(error.message)) {
      if (!(await hasActiveAuthSession(sb))) return { ok: true };
    }
    console.error("[Supabase] upsert single file:", error);
    return { ok: false, detail: error.message };
  }
  return { ok: true };
}

async function writeProjectFilesToDb(
  sb: SupabaseClient,
  files: FileItem[],
  projectId: string,
  generation: number,
): Promise<SaveProjectFilesResult> {
  if (isProjectSaveGenerationStale(projectId, generation)) {
    logPipelineEvent("warn", "persist.stale_discarded", {
      projectId,
      generation,
      fileCount: files.length,
      phase: "persist",
    });
    return { ok: true };
  }

  const { data: owned } = await sb.from("projects").select("id").eq("id", projectId).maybeSingle();
  if (!owned?.id) {
    try {
      localStorage.removeItem(PROJECT_KEY);
    } catch {
      /* ignore */
    }
    return { ok: false, reason: "no_project", detail: "project_not_visible" };
  }

  if (isProjectSaveGenerationStale(projectId, generation)) {
    logPipelineEvent("warn", "persist.stale_discarded", {
      projectId,
      generation,
      phase: "persist",
      step: "post_project_check",
    });
    return { ok: true };
  }

  const { error: delErr } = await sb.from("project_files").delete().eq("project_id", projectId);
  if (delErr) {
    if (projectSaveSuppressed || isRlsAuthError(delErr.message)) {
      if (!(await hasActiveAuthSession(sb))) return { ok: true };
    }
    console.error("[Supabase] delete files error:", delErr);
    return { ok: false, reason: "delete_failed", detail: delErr.message };
  }

  if (files.length === 0) return { ok: true };

  if (isProjectSaveGenerationStale(projectId, generation)) {
    logPipelineEvent("warn", "persist.stale_discarded", {
      projectId,
      generation,
      phase: "persist",
      step: "pre_insert",
    });
    return { ok: true };
  }

  const map = new Map<string, FileItem>();
  for (const f of files) map.set(f.name, f);
  const rows = Array.from(map.values()).map((f) => ({
    project_id: projectId,
    name: f.name,
    language: f.language,
    content: f.content,
  }));

  const { error: insErr } = await sb.from("project_files").insert(rows);
  if (insErr) {
    if (projectSaveSuppressed || isRlsAuthError(insErr.message)) {
      if (!(await hasActiveAuthSession(sb))) return { ok: true };
    }
    console.error("[Supabase] insert files error:", insErr);
    return { ok: false, reason: "insert_failed", detail: insErr.message };
  }
  return { ok: true };
}

async function writeProjectFilesViaServer(
  files: FileItem[],
  projectId: string,
  generation: number,
): Promise<SaveProjectFilesResult | null> {
  if (isProjectSaveGenerationStale(projectId, generation)) {
    return { ok: true };
  }

  const { saveProjectFilesViaServer } = await import("@/lib/projects/project-save-client");
  const payload = files.map((f) => ({
    name: f.name,
    language: f.language ?? "plaintext",
    content: f.content,
  }));

  const result = await saveProjectFilesViaServer(projectId, payload, "ide");
  if (result.ok) {
    logPipelineEvent("info", "persist.server_ok", {
      projectId,
      generation,
      fileCount: files.length,
      requestId: result.requestId,
      phase: "persist",
    });
    return { ok: true };
  }

  if (
    result.code === "FORBIDDEN" ||
    result.code === "NOT_FOUND" ||
    result.code === "INVALID_INPUT"
  ) {
    return {
      ok: false,
      reason: result.code === "NOT_FOUND" ? "no_project" : "insert_failed",
      detail: result.error,
    };
  }

  console.warn("[Supabase] server save fallback to client RLS:", result.error);
  return null;
}

export async function saveProjectFilesDetailed(
  files: FileItem[],
  explicitProjectId?: string | null,
): Promise<SaveProjectFilesResult> {
  if (projectSaveSuppressed) return { ok: true };

  let projectId = explicitProjectId?.trim() || null;
  if (!projectId) {
    const sb = await getUserSupabaseAsync();
    if (!sb) return { ok: false, reason: "no_client" };
    if (!(await hasActiveAuthSession(sb))) return { ok: true };
    projectId = await ensureProjectId();
  }
  if (!projectId) return { ok: false, reason: "no_project" };

  const generation = allocateProjectSaveGeneration(projectId);
  const snapshot = files.map((f) => ({ ...f }));

  return runSerializedProjectSave(projectId, async () => {
    if (isProjectSaveGenerationStale(projectId, generation)) return { ok: true };

    const serverResult = await writeProjectFilesViaServer(snapshot, projectId, generation);
    if (serverResult) return serverResult;

    const sb = await getUserSupabaseAsync();
    if (!sb) return { ok: false, reason: "no_client" };
    if (!(await hasActiveAuthSession(sb))) return { ok: true };

    return writeProjectFilesToDb(sb, snapshot, projectId, generation);
  });
}

export type SnapshotRow = {
  id: string;
  label: string | null;
  file_count: number;
  created_at: string;
};

export async function listSnapshots(explicitProjectId?: string | null): Promise<SnapshotRow[]> {
  const sb = await getUserSupabaseAsync();
  if (!sb) return [];
  const projectId = explicitProjectId?.trim() || (await ensureProjectId());
  if (!projectId) return [];
  const { data, error } = await sb
    .from("project_snapshots")
    .select("id, label, file_count, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error("[Supabase] list snapshots error:", error);
    return [];
  }
  return (data ?? []) as SnapshotRow[];
}

/** Última captura cuya etiqueta empieza por un prefijo (p. ej. «antes:»). */
export async function findLatestSnapshotByLabelPrefix(
  explicitProjectId: string,
  prefix: string,
): Promise<SnapshotRow | null> {
  const trimmed = prefix.trim();
  if (!trimmed) return null;
  const list = await listSnapshots(explicitProjectId);
  const lower = trimmed.toLowerCase();
  return list.find((s) => s.label?.toLowerCase().startsWith(lower)) ?? null;
}

export async function createSnapshot(
  files: FileItem[],
  label?: string,
  explicitProjectId?: string | null,
): Promise<boolean> {
  const sb = await getUserSupabaseAsync();
  if (!sb) return false;
  const projectId = explicitProjectId?.trim() || (await ensureProjectId());
  if (!projectId) return false;
  const { data: userRes } = await sb.auth.getUser();
  const userId = userRes?.user?.id;
  if (!userId) return false;
  const { error } = await sb.from("project_snapshots").insert({
    project_id: projectId,
    user_id: userId,
    label: label ?? null,
    files: files as any,
    file_count: files.length,
  });
  if (error) {
    console.error("[Supabase] create snapshot error:", error);
    return false;
  }
  return true;
}

export async function loadSnapshotFiles(
  snapshotId: string,
  explicitProjectId?: string | null,
): Promise<FileItem[] | null> {
  const sb = await getUserSupabaseAsync();
  if (!sb) return null;
  const projectId = explicitProjectId?.trim() || (await ensureProjectId());
  if (!projectId) return null;
  let query = sb
    .from("project_snapshots")
    .select("files")
    .eq("id", snapshotId)
    .eq("project_id", projectId);
  const { data, error } = await query.maybeSingle();
  if (error || !data) {
    console.error("[Supabase] load snapshot error:", error);
    return null;
  }
  return normalizeSnapshotFiles(data.files);
}

export async function deleteSnapshot(snapshotId: string): Promise<boolean> {
  const sb = await getUserSupabaseAsync();
  if (!sb) return false;
  const { error } = await sb.from("project_snapshots").delete().eq("id", snapshotId);
  if (error) {
    console.error("[Supabase] delete snapshot error:", error);
    return false;
  }
  return true;
}

export type SecretRow = {
  id: string;
  name: string;
  value: string;
  description: string | null;
  updated_at: string;
};

export async function listSecrets(): Promise<SecretRow[]> {
  const sb = await getUserSupabaseAsync();
  if (!sb) return [];
  const projectId = await ensureProjectId();
  if (!projectId) return [];
  const { data, error } = await sb
    .from("project_secrets")
    .select("id, name, value, description, updated_at")
    .eq("project_id", projectId)
    .order("name", { ascending: true });
  if (error) {
    console.error("[Supabase] list secrets error:", error);
    return [];
  }
  return (data ?? []) as SecretRow[];
}

export async function upsertSecret(
  name: string,
  value: string,
  description?: string,
): Promise<boolean> {
  const sb = await getUserSupabaseAsync();
  if (!sb) return false;
  const projectId = await ensureProjectId();
  if (!projectId) return false;
  const { data: userRes } = await sb.auth.getUser();
  const userId = userRes?.user?.id;
  if (!userId) return false;
  const cleanName = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_");
  if (!cleanName) return false;
  const { error } = await sb.from("project_secrets").upsert(
    {
      project_id: projectId,
      user_id: userId,
      name: cleanName,
      value,
      description: description ?? null,
    },
    { onConflict: "project_id,name" },
  );
  if (error) {
    console.error("[Supabase] upsert secret error:", error);
    return false;
  }
  return true;
}

export async function deleteSecret(id: string): Promise<boolean> {
  const sb = await getUserSupabaseAsync();
  if (!sb) return false;
  const { error } = await sb.from("project_secrets").delete().eq("id", id);
  if (error) {
    console.error("[Supabase] delete secret error:", error);
    return false;
  }
  return true;
}

// ============= MCP / Connector connections =============
export type McpConnectionRow = {
  id: string;
  connector_id: string;
  display_name: string;
  kind: string;
  status: string;
  config: Record<string, unknown>;
  created_at: string;
};

export async function listMcpConnections(): Promise<McpConnectionRow[]> {
  const sb = await getUserSupabaseAsync();
  if (!sb) return [];
  const projectId = await ensureProjectId();
  if (!projectId) return [];
  const { data, error } = await sb
    .from("mcp_connections")
    .select("id, connector_id, display_name, kind, status, config, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[Supabase] list mcp_connections error:", error);
    return [];
  }
  return (data ?? []) as McpConnectionRow[];
}

export async function upsertMcpConnection(
  connectorId: string,
  displayName: string,
  kind: "standard" | "mcp" = "standard",
  config: Record<string, unknown> = {},
): Promise<boolean> {
  const sb = await getUserSupabaseAsync();
  if (!sb) return false;
  const projectId = await ensureProjectId();
  if (!projectId) return false;
  const { data: userRes } = await sb.auth.getUser();
  const userId = userRes?.user?.id;
  if (!userId) return false;
  const { error } = await sb.from("mcp_connections").upsert(
    {
      project_id: projectId,
      user_id: userId,
      connector_id: connectorId,
      display_name: displayName,
      kind,
      status: "connected",
      config: config as any,
    },
    { onConflict: "project_id,connector_id" },
  );
  if (error) {
    console.error("[Supabase] upsert mcp_connection error:", error);
    return false;
  }
  return true;
}

export async function deleteMcpConnection(id: string): Promise<boolean> {
  const sb = await getUserSupabaseAsync();
  if (!sb) return false;
  const { error } = await sb.from("mcp_connections").delete().eq("id", id);
  if (error) {
    console.error("[Supabase] delete mcp_connection error:", error);
    return false;
  }
  return true;
}

// ============= Publish pipeline =============
export type PublishRow = {
  id: string;
  status: string;
  url: string | null;
  visibility: string;
  file_count: number;
  http_status: number | null;
  latency_ms: number | null;
  error: string | null;
  created_at: string;
};

export async function recordPublish(input: {
  projectId?: string;
  url?: string;
  visibility?: "public" | "private";
  fileCount?: number;
  httpStatus?: number;
  latencyMs?: number;
  status?: "pending" | "ok" | "fail";
  error?: string;
  metadata?: Record<string, unknown>;
}): Promise<string | null> {
  const sb = await getUserSupabaseAsync();
  if (!sb) return null;
  const projectId = input.projectId ?? (await ensureProjectId());
  if (!projectId) return null;
  const { data: userRes } = await sb.auth.getUser();
  const userId = userRes?.user?.id;
  if (!userId) return null;
  const { data, error } = await sb
    .from("project_publishes")
    .insert({
      project_id: projectId,
      user_id: userId,
      status: input.status ?? "pending",
      url: input.url ?? null,
      visibility: input.visibility ?? "public",
      file_count: input.fileCount ?? 0,
      http_status: input.httpStatus ?? null,
      latency_ms: input.latencyMs ?? null,
      error: input.error ?? null,
      metadata: (input.metadata ?? {}) as any,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[Supabase] insert project_publishes error:", error);
    return null;
  }
  return (data?.id as string) ?? null;
}

export async function updatePublishRecord(
  id: string,
  patch: Partial<{
    status: string;
    http_status: number;
    latency_ms: number;
    error: string | null;
    metadata: Record<string, unknown>;
  }>,
): Promise<boolean> {
  const sb = await getUserSupabaseAsync();
  if (!sb) return false;
  const { error } = await sb
    .from("project_publishes")
    .update(patch as any)
    .eq("id", id);
  if (error) {
    console.error("[Supabase] update project_publishes error:", error);
    return false;
  }
  return true;
}

export async function listPublishes(limit = 20, explicitProjectId?: string): Promise<PublishRow[]> {
  const sb = await getUserSupabaseAsync();
  if (!sb) return [];
  const projectId = explicitProjectId ?? (await ensureProjectId());
  if (!projectId) return [];
  const { data, error } = await sb
    .from("project_publishes")
    .select("id, status, url, visibility, file_count, http_status, latency_ms, error, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[Supabase] list publishes error:", error);
    return [];
  }
  return (data ?? []) as PublishRow[];
}

// Reveal a secret by RPC (decrypts server-side, RLS enforced)
export async function revealSecret(secretId: string): Promise<string | null> {
  const sb = await getUserSupabaseAsync();
  if (!sb) return null;
  const { data, error } = await sb.rpc("decrypt_project_secret", { _secret_id: secretId });
  if (error) {
    console.error("[Supabase] decrypt_project_secret error:", error);
    return null;
  }
  return (data as string) ?? null;
}
