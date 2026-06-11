import { hydrateAuthFromStorage, initAuthOnce } from "@/hooks/useAuth";
import { gafcoreAuthJsonFetch } from "@/lib/gafcore-client-auth-fetch";
import type {
  ProjectSaveErrorCode,
  ProjectSaveResult,
} from "@/lib/projects/project-save.shared";

export type ProjectFilePayload = {
  name: string;
  language?: string;
  content: string;
};

/**
 * Guarda archivos vía API service role (primario en producción).
 * Usado desde userSupabase y pipeline de IA sin depender de RLS del cliente.
 */
export async function saveProjectFilesViaServer(
  projectId: string,
  files: ProjectFilePayload[],
  source?: "ide" | "chat" | "pipeline" | "manual",
): Promise<ProjectSaveResult> {
  if (!projectId?.trim() || files.length === 0) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      error: "projectId o files vacíos",
      requestId: "client",
      retryable: false,
    };
  }

  try {
    await initAuthOnce();
    try {
      await hydrateAuthFromStorage(3_000);
    } catch {
      /* ignore */
    }

    type ApiSaveResponse = {
      ok: boolean;
      error?: string;
      code?: ProjectSaveErrorCode;
      requestId?: string;
    };

    const res = await gafcoreAuthJsonFetch<ApiSaveResponse>(
      "/api/gafcore/projects-files-save",
      { projectId, files, source },
    );

    if (res.ok) {
      return { ok: true, requestId: res.requestId ?? "api" };
    }

    return {
      ok: false,
      code: res.code ?? "DB_FAILED",
      error: res.error ?? "save_failed",
      requestId: res.requestId ?? "api",
      retryable: res.code !== "FORBIDDEN" && res.code !== "NOT_FOUND",
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error de red o sesión";
    return {
      ok: false,
      code: message === "Inicia sesión para continuar." ? "UNAUTHORIZED" : "UNKNOWN",
      error: message,
      requestId: "client",
      retryable: true,
    };
  }
}
