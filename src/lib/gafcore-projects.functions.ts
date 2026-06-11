import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { listProjectsForUser } from "@/lib/gafcore-projects-api.server";
import { CreateProjectInputSchema } from "@/lib/projects/project-create.shared";
import { executeCreateProject } from "@/lib/projects/project-create.service.server";

/** Lista proyectos del usuario autenticado (service role en servidor). */
export const listGafcoreProjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const result = await listProjectsForUser(context.userId!);
    if (!result.ok) {
      return { ok: false as const, error: result.error, projects: [] as const };
    }
    return { ok: true as const, projects: result.projects };
  });

/** Crea proyecto + archivos iniciales (única entrada tipada desde la UI). */
export const createGafcoreProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateProjectInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    return executeCreateProject(context.userId!, data);
  });
