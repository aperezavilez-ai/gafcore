import { z } from "zod";

export const CreateProjectFileSchema = z.object({
  name: z.string().min(1).max(512),
  language: z.string().max(64).optional(),
  content: z.string().max(500_000),
});

export const CreateProjectInputSchema = z
  .object({
    name: z.string().min(1).max(200),
    templateSlug: z.string().min(1).max(80).optional(),
    files: z.array(CreateProjectFileSchema).max(500).optional(),
    source: z.enum(["dialog", "import", "chat", "marketplace"]).optional(),
  })
  .refine((d) => !(d.files?.length && d.templateSlug), {
    message: "Usa plantilla o archivos importados, no ambos",
  });

export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

export type CreatedProject = {
  id: string;
  name: string;
  created_at: string;
};

export type CreatedProjectFile = {
  name: string;
  language: string;
  content: string;
};

export type ProjectCreateErrorCode =
  | "UNAUTHORIZED"
  | "SERVER_MISCONFIGURED"
  | "INVALID_INPUT"
  | "TEMPLATE_EMPTY"
  | "IMPORT_EMPTY"
  | "DB_FAILED"
  | "UNKNOWN";

export type ProjectCreateFailure = {
  ok: false;
  code: ProjectCreateErrorCode;
  error: string;
  requestId: string;
  retryable: boolean;
};

export type ProjectCreateSuccess = {
  ok: true;
  project: CreatedProject;
  files: CreatedProjectFile[];
  requestId: string;
};

export type ProjectCreateResult = ProjectCreateSuccess | ProjectCreateFailure;

/** Mensaje legible para toast según código de error. */
export function projectCreateErrorMessage(result: ProjectCreateFailure): string {
  switch (result.code) {
    case "UNAUTHORIZED":
      return "Inicia sesión para crear un proyecto.";
    case "SERVER_MISCONFIGURED":
      return "Falta configuración del servidor (SUPABASE_SERVICE_ROLE_KEY).";
    case "TEMPLATE_EMPTY":
      return "No se encontró la plantilla seleccionada.";
    case "IMPORT_EMPTY":
      return "No hay archivos válidos para importar.";
    case "INVALID_INPUT":
      return result.error || "Datos de creación inválidos.";
    case "DB_FAILED":
      return result.error || "No se pudo guardar el proyecto en la base de datos.";
    default:
      return result.error || "No se pudo crear el proyecto.";
  }
}
