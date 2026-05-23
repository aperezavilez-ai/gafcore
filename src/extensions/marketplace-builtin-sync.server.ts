import {
  BUILTIN_PROJECT_TEMPLATES,
  type GafcoreProjectTemplateDef,
  type GafcoreTemplateFile,
} from "@/lib/gafcore-templates.shared";
import type { TemplateExtensionManifest } from "@/extensions/manifests.shared";
import { templateFilesFromManifest } from "@/extensions/extension-host.server";
import { upsertListingFromManifest } from "@/extensions/publisher.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PUBLISHER_SLUG = "gafcore-labs";
const VERSION = "1.0.0";

function toMarketplacePath(name: string): string | null {
  const norm = name.replace(/\\/g, "/");
  if (norm === "index.html") return "public/index.html";
  if (norm.startsWith("src/") || norm.startsWith("public/")) return norm;
  if (norm.startsWith("lib/")) return `src/${norm}`;
  return `src/${norm}`;
}

export function builtinTemplateToManifest(
  template: GafcoreProjectTemplateDef,
): TemplateExtensionManifest {
  const files: GafcoreTemplateFile[] = [];
  for (const file of template.files) {
    const path = toMarketplacePath(file.name);
    if (!path) continue;
    let content = file.content;
    if (path === "public/index.html") {
      content = content.replace(
        'src="/main.tsx"',
        'src="/src/main.tsx"',
      );
    }
    files.push({
      name: path,
      language: file.language,
      content,
    });
  }

  const manifest: TemplateExtensionManifest = {
    kind: "template",
    version: 1,
    slug: template.slug,
    name: template.name,
    description: template.description,
    category:
      template.category === "mobile" ||
      template.category === "dashboard" ||
      template.category === "blog" ||
      template.category === "portfolio" ||
      template.category === "starter" ||
      template.category === "landing" ||
      template.category === "ecommerce"
        ? template.category
        : "starter",
    files,
    requiredPaths: ["src/App.tsx"],
  };

  templateFilesFromManifest(manifest);
  return manifest;
}

/** Publica/actualiza las plantillas built-in de GafCore en el marketplace (GafCore Labs). */
export async function syncBuiltinTemplatesToMarketplace(): Promise<
  { ok: true; synced: number; slugs: string[]; errors: string[] } | { ok: false; error: string }
> {
  const slugs: string[] = [];
  const errors: string[] = [];

  for (const template of BUILTIN_PROJECT_TEMPLATES) {
    try {
      const manifest = builtinTemplateToManifest(template);
      const result = await upsertListingFromManifest({
        publisherSlug: PUBLISHER_SLUG,
        listingSlug: template.slug,
        name: template.name,
        description: template.description,
        kind: "template",
        versionLabel: VERSION,
        manifestJson: JSON.stringify(manifest),
        publish: true,
        priceCents: 0,
        currency: "eur",
      });

      if (!result.ok) {
        errors.push(`${template.slug}: ${result.error}`);
        continue;
      }

      await supabaseAdmin
        .from("gafcore_marketplace_listings")
        .update({
          sort_order: template.sort_order,
          updated_at: new Date().toISOString(),
        })
        .eq("id", result.listingId);

      slugs.push(template.slug);
    } catch (e) {
      errors.push(`${template.slug}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { ok: true, synced: slugs.length, slugs, errors };
}
