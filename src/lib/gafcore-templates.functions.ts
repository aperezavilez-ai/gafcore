import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  listActiveTemplates,
  loadTemplateFilesBySlug,
} from "@/lib/gafcore-templates.server";
import type { GafcoreTemplateFile } from "@/lib/gafcore-templates.shared";

export const listGafcoreProjectTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const templates = await listActiveTemplates();
    return { templates };
  });

const createSchema = z.object({
  name: z.string().min(1).max(200),
  templateSlug: z.string().min(1).max(80).optional(),
});

export const createProjectFromTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId!;
    const sb = context.supabase!;

    const files = await loadTemplateFilesBySlug(data.templateSlug ?? "blank-vite");

    const { data: project, error: pErr } = await sb
      .from("projects")
      .insert({ name: data.name.trim(), user_id: userId })
      .select("id, name, created_at")
      .single();

    if (pErr || !project?.id) {
      console.error("[templates] create project:", pErr);
      return { ok: false as const, message: "No se pudo crear el proyecto." };
    }

    const rows = files.map((f) => ({
      project_id: project.id,
      name: f.name,
      language: f.language,
      content: f.content,
    }));

    const { error: fErr } = await sb.from("project_files").insert(rows);
    if (fErr) {
      console.error("[templates] insert files:", fErr);
      await sb.from("projects").delete().eq("id", project.id);
      return { ok: false as const, message: "No se pudieron guardar los archivos de la plantilla." };
    }

    return {
      ok: true as const,
      project: {
        id: project.id as string,
        name: project.name as string,
        created_at: project.created_at as string,
      },
      files: files as GafcoreTemplateFile[],
      templateSlug: data.templateSlug ?? "blank-vite",
    };
  });
