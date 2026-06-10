import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { listProjectsForUser } from "@/lib/gafcore-projects-api.server";

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
