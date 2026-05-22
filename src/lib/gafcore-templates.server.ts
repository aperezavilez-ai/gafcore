import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  BUILTIN_PROJECT_TEMPLATES,
  GAFCORE_DEFAULT_TEMPLATE_FILES,
  GAFCORE_DEFAULT_TEMPLATE_SLUG,
  validateTemplateFiles,
  type GafcoreProjectTemplateDef,
  type GafcoreTemplateFile,
} from "@/lib/gafcore-templates.shared";

export type TemplateListItem = {
  slug: string;
  name: string;
  description: string;
  category: string;
  sort_order: number;
};

let seedPromise: Promise<void> | null = null;

/** Inserta plantillas built-in si la tabla está vacía (idempotente por slug). */
export async function ensureBuiltinTemplatesSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      const { count, error } = await supabaseAdmin
        .from("gafcore_project_templates")
        .select("id", { count: "exact", head: true });
      if (error) {
        console.error("[templates] count:", error);
        return;
      }
      if ((count ?? 0) > 0) return;

      for (const t of BUILTIN_PROJECT_TEMPLATES) {
        const { error: insErr } = await supabaseAdmin.from("gafcore_project_templates").upsert(
          {
            slug: t.slug,
            name: t.name,
            description: t.description,
            category: t.category,
            files: t.files,
            is_active: true,
            sort_order: t.sort_order,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "slug" },
        );
        if (insErr) console.error("[templates] seed:", t.slug, insErr);
      }
    })();
  }
  await seedPromise;
}

export async function listActiveTemplates(userId?: string): Promise<TemplateListItem[]> {
  await ensureBuiltinTemplatesSeeded();
  const { data, error } = await supabaseAdmin
    .from("gafcore_project_templates")
    .select("slug, name, description, category, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("[templates] list:", error);
    return BUILTIN_PROJECT_TEMPLATES.map((t) => ({
      slug: t.slug,
      name: t.name,
      description: t.description,
      category: t.category,
      sort_order: t.sort_order,
    }));
  }
  const base = (data ?? []) as TemplateListItem[];
  if (!userId) return base;

  const { listUserTemplateSlugs } = await import("@/extensions/marketplace.server");
  const ext = await listUserTemplateSlugs(userId);
  const extItems: TemplateListItem[] = ext.map((e, i) => ({
    slug: e.slug,
    name: e.name,
    description: e.description,
    category: "starter",
    sort_order: 1000 + i,
  }));
  return [...base, ...extItems];
}

export async function loadTemplateFilesBySlug(
  slug: string,
  userId?: string,
): Promise<GafcoreTemplateFile[]> {
  await ensureBuiltinTemplatesSeeded();
  const key = slug.trim() || GAFCORE_DEFAULT_TEMPLATE_SLUG;

  if (userId && key.startsWith("ext:")) {
    const { loadExtensionTemplateFiles } = await import("@/extensions/marketplace.server");
    const extFiles = await loadExtensionTemplateFiles(userId, key);
    if (extFiles?.length) return extFiles;
  }
  const { data, error } = await supabaseAdmin
    .from("gafcore_project_templates")
    .select("files")
    .eq("slug", key)
    .eq("is_active", true)
    .maybeSingle();
  if (error || !data?.files) {
    const builtin = BUILTIN_PROJECT_TEMPLATES.find((t) => t.slug === key);
    return builtin?.files ?? GAFCORE_DEFAULT_TEMPLATE_FILES;
  }
  return validateTemplateFiles(data.files);
}

export function builtinTemplateBySlug(slug: string): GafcoreProjectTemplateDef | undefined {
  return BUILTIN_PROJECT_TEMPLATES.find((t) => t.slug === slug);
}
