import { saveProjectFilesForUser } from "@/lib/gafcore-projects-api.server";
import type {
  ProjectSaveErrorCode,
  ProjectSaveResult,
  SaveProjectFilesInput,
} from "@/lib/projects/project-save.shared";

function newRequestId(): string {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return String(Date.now()).slice(-8);
  }
}

function mapSaveError(raw: string): { code: ProjectSaveErrorCode; retryable: boolean } {
  const m = raw.toLowerCase();
  if (m.includes("service_role") || m.includes("supabase_service_role")) {
    return { code: "SERVER_MISCONFIGURED", retryable: false };
  }
  if (m.includes("unauthorized") || m.includes("jwt")) {
    return { code: "UNAUTHORIZED", retryable: true };
  }
  if (m.includes("forbidden")) {
    return { code: "FORBIDDEN", retryable: false };
  }
  if (m.includes("not_found") || m.includes("no encontrado")) {
    return { code: "NOT_FOUND", retryable: false };
  }
  if (m.includes("invalid")) {
    return { code: "INVALID_INPUT", retryable: false };
  }
  return { code: "DB_FAILED", retryable: true };
}

/** Guarda archivos del proyecto (service role — evita fallos RLS en cliente). */
export async function executeSaveProjectFiles(
  userId: string,
  input: SaveProjectFilesInput,
): Promise<ProjectSaveResult> {
  const requestId = newRequestId();
  const source = input.source ?? "manual";

  try {
    const result = await saveProjectFilesForUser(
      userId,
      input.projectId,
      input.files.map((f) => ({
        name: f.name,
        language: f.language,
        content: f.content,
      })),
    );

    if (!result.ok) {
      const mapped = mapSaveError(result.error);
      console.error(`[project-save:${requestId}] source=${source}`, result.error);
      return {
        ok: false,
        code: mapped.code,
        error: result.error,
        requestId,
        retryable: mapped.retryable,
      };
    }

    return { ok: true, requestId };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(`[project-save:${requestId}] source=${source} exception`, e);
    const mapped = mapSaveError(detail);
    return {
      ok: false,
      code: mapped.code === "DB_FAILED" ? "UNKNOWN" : mapped.code,
      error: detail || "Error inesperado al guardar archivos.",
      requestId,
      retryable: mapped.retryable,
    };
  }
}
