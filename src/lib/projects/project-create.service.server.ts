import { createProjectForUser } from "@/lib/gafcore-projects-api.server";
import { validateTemplateFiles } from "@/lib/gafcore-templates.shared";
import type {
  CreateProjectInput,
  ProjectCreateErrorCode,
  ProjectCreateResult,
} from "@/lib/projects/project-create.shared";

function newRequestId(): string {
  try {
    return crypto.randomUUID().slice(0, 8);
  } catch {
    return String(Date.now()).slice(-8);
  }
}

function mapCreateError(raw: string): { code: ProjectCreateErrorCode; retryable: boolean } {
  const m = raw.toLowerCase();
  if (m.includes("service_role") || m.includes("supabase_service_role")) {
    return { code: "SERVER_MISCONFIGURED", retryable: false };
  }
  if (m.includes("unauthorized") || m.includes("jwt") || m.includes("sesión")) {
    return { code: "UNAUTHORIZED", retryable: true };
  }
  if (m.includes("plantilla") || m.includes("template")) {
    return { code: "TEMPLATE_EMPTY", retryable: false };
  }
  if (m.includes("importar") || m.includes("archivos válidos")) {
    return { code: "IMPORT_EMPTY", retryable: false };
  }
  if (m.includes("invalid") || m.includes("inválid")) {
    return { code: "INVALID_INPUT", retryable: false };
  }
  return { code: "DB_FAILED", retryable: true };
}

/**
 * Orquestación canónica de creación de proyecto (DB + plantilla/archivos).
 * Usada por serverFn y por HTTP handler.
 */
export async function executeCreateProject(
  userId: string,
  input: CreateProjectInput,
): Promise<ProjectCreateResult> {
  const requestId = newRequestId();
  const source = input.source ?? "dialog";

  try {
    const customFiles = input.files?.length ? validateTemplateFiles(input.files) : undefined;
    const result = await createProjectForUser(userId, input.name.trim(), {
      templateSlug: input.templateSlug,
      customFiles,
    });

    if (!result.ok) {
      const mapped = mapCreateError(result.error);
      console.error(`[project-create:${requestId}] source=${source}`, result.error);
      return {
        ok: false,
        code: mapped.code,
        error: result.error,
        requestId,
        retryable: mapped.retryable,
      };
    }

    return {
      ok: true,
      project: result.project,
      files: result.files,
      requestId,
    };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(`[project-create:${requestId}] source=${source} exception`, e);
    const mapped = mapCreateError(detail);
    return {
      ok: false,
      code: mapped.code === "DB_FAILED" ? "UNKNOWN" : mapped.code,
      error: detail || "Error inesperado al crear el proyecto.",
      requestId,
      retryable: mapped.retryable,
    };
  }
}
