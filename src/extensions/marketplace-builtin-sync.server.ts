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

const CAPACITOR_GUIDE_APPEND = `Cuando el usuario pida app móvil nativa, PWA instalable o publicar en App Store / Google Play:

1. **Base GafCore**: el proyecto es web mobile-first (Vite + React). La preview del IDE ya funciona en móvil.
2. **PWA**: asegura manifest.json, iconos, theme-color y service worker si el usuario quiere «instalar» desde el navegador.
3. **Capacitor (recomendado para nativo)**:
   - npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
   - npm run build (salida en dist/)
   - npx cap init "Mi App" com.ejemplo.app --web-dir=dist
   - npx cap add android && npx cap add ios
   - npx cap sync && npx cap open android (o ios)
4. **Permisos**: cámara, geolocalización, push → plugins @capacitor/* correspondientes.
5. **Expo / React Native**: solo si piden explícitamente RN; explica que es otro stack y ofrece migración gradual o plantilla Expo del marketplace.

Edita archivos del proyecto (package.json, capacitor.config, index.html) con cambios concretos; no dejes TODO en el flujo principal.`;

const BUILTIN_MARKETPLACE_PLUGINS = [
  {
    slug: "capacitor-pwa-guide",
    name: "Guía Capacitor / PWA",
    description: "Plugin IA: convierte plantillas móviles en app instalable o nativa con Capacitor.",
    sort_order: 45,
    manifest: {
      kind: "ai_plugin" as const,
      version: 1 as const,
      id: "capacitor-pwa-guide",
      name: "Guía Capacitor / PWA",
      description: "Asistente para PWA + Capacitor iOS/Android.",
      hooks: ["before_chat"] as const,
      systemPromptAppend: CAPACITOR_GUIDE_APPEND,
    },
  },
];

const BUILTIN_WORKFLOW_PACKS = [
  {
    slug: "landing-build-pack",
    name: "Pack: landing en 2 pasos",
    description: "Workflow multiagente: frontend + validación para una landing.",
    sort_order: 50,
    manifest: {
      kind: "workflow_pack" as const,
      version: 1 as const,
      slug: "landing-build-pack",
      name: "Pack: landing en 2 pasos",
      description: "Plan precargado frontend → validación.",
      defaultInstruction: "Mejorar la landing del proyecto: hero, CTA y estilos coherentes.",
      plan: {
        version: 1 as const,
        summary: "Landing: UI + validación",
        tasks: [
          {
            id: "fe-1",
            agentType: "frontend" as const,
            title: "Hero y layout",
            instruction: "Refina index/App: hero claro, CTA visible, responsive mobile-first.",
            priority: "high" as const,
            dependsOn: [] as string[],
          },
          {
            id: "val-1",
            agentType: "validation" as const,
            title: "Validar build",
            instruction: "Comprueba sintaxis TSX/CSS y que no queden handlers vacíos.",
            priority: "normal" as const,
            dependsOn: ["fe-1"],
          },
        ],
      },
    },
  },
];

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

/** Publica plugins IA oficiales (p. ej. guía Capacitor). */
export async function syncBuiltinPluginsToMarketplace(): Promise<{
  ok: true;
  synced: number;
  slugs: string[];
  errors: string[];
}> {
  const slugs: string[] = [];
  const errors: string[] = [];

  for (const plugin of BUILTIN_MARKETPLACE_PLUGINS) {
    try {
      const result = await upsertListingFromManifest({
        publisherSlug: PUBLISHER_SLUG,
        listingSlug: plugin.slug,
        name: plugin.name,
        description: plugin.description,
        kind: "ai_plugin",
        versionLabel: VERSION,
        manifestJson: JSON.stringify(plugin.manifest),
        publish: true,
        priceCents: 0,
        currency: "eur",
      });

      if (!result.ok) {
        errors.push(`${plugin.slug}: ${result.error}`);
        continue;
      }

      await supabaseAdmin
        .from("gafcore_marketplace_listings")
        .update({
          sort_order: plugin.sort_order,
          updated_at: new Date().toISOString(),
        })
        .eq("id", result.listingId);

      slugs.push(plugin.slug);
    } catch (e) {
      errors.push(`${plugin.slug}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { ok: true, synced: slugs.length, slugs, errors };
}

/** Publica workflow packs oficiales. */
export async function syncBuiltinWorkflowPacksToMarketplace(): Promise<{
  ok: true;
  synced: number;
  slugs: string[];
  errors: string[];
}> {
  const slugs: string[] = [];
  const errors: string[] = [];

  for (const pack of BUILTIN_WORKFLOW_PACKS) {
    try {
      const result = await upsertListingFromManifest({
        publisherSlug: PUBLISHER_SLUG,
        listingSlug: pack.slug,
        name: pack.name,
        description: pack.description,
        kind: "workflow_pack",
        versionLabel: VERSION,
        manifestJson: JSON.stringify(pack.manifest),
        publish: true,
        priceCents: 0,
        currency: "eur",
      });

      if (!result.ok) {
        errors.push(`${pack.slug}: ${result.error}`);
        continue;
      }

      await supabaseAdmin
        .from("gafcore_marketplace_listings")
        .update({
          sort_order: pack.sort_order,
          updated_at: new Date().toISOString(),
        })
        .eq("id", result.listingId);

      slugs.push(pack.slug);
    } catch (e) {
      errors.push(`${pack.slug}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { ok: true, synced: slugs.length, slugs, errors };
}

/** Plantillas + plugins + workflow packs oficiales en una sola pasada. */
export async function syncBuiltinCatalogToMarketplace(): Promise<
  | {
      ok: true;
      templates: { synced: number; slugs: string[]; errors: string[] };
      plugins: { synced: number; slugs: string[]; errors: string[] };
      workflowPacks: { synced: number; slugs: string[]; errors: string[] };
    }
  | { ok: false; error: string }
> {
  const templates = await syncBuiltinTemplatesToMarketplace();
  if (!templates.ok) return templates;
  const plugins = await syncBuiltinPluginsToMarketplace();
  const workflowPacks = await syncBuiltinWorkflowPacksToMarketplace();
  return { ok: true, templates, plugins, workflowPacks };
}
