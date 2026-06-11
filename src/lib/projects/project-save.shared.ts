import { z } from "zod";
import { CreateProjectFileSchema } from "@/lib/projects/project-create.shared";

export const SaveProjectFilesInputSchema = z.object({
  projectId: z.string().uuid(),
  files: z.array(CreateProjectFileSchema).max(500),
  source: z.enum(["ide", "chat", "pipeline", "manual"]).optional(),
});

export type SaveProjectFilesInput = z.infer<typeof SaveProjectFilesInputSchema>;

export type ProjectSaveErrorCode =
  | "UNAUTHORIZED"
  | "SERVER_MISCONFIGURED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_INPUT"
  | "DB_FAILED"
  | "UNKNOWN";

export type ProjectSaveFailure = {
  ok: false;
  code: ProjectSaveErrorCode;
  error: string;
  requestId: string;
  retryable: boolean;
};

export type ProjectSaveSuccess = {
  ok: true;
  requestId: string;
};

export type ProjectSaveResult = ProjectSaveSuccess | ProjectSaveFailure;

export function projectSaveErrorMessage(result: ProjectSaveFailure): string {
  switch (result.code) {
    case "UNAUTHORIZED":
      return "Inicia sesión para guardar el proyecto.";
    case "SERVER_MISCONFIGURED":
      return "Falta configuración del servidor para guardar archivos.";
    case "FORBIDDEN":
      return "No tienes permiso para guardar este proyecto.";
    case "NOT_FOUND":
      return "Proyecto no encontrado.";
    case "INVALID_INPUT":
      return result.error || "Archivos inválidos.";
    default:
      return result.error || "No se pudieron guardar los archivos.";
  }
}
