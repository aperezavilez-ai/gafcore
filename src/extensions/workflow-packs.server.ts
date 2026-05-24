import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  extensionsEnabled,
  parseExtensionManifest,
} from "@/extensions/extension-host.server";
import type { TaskPlan } from "@/tasks/artifacts.shared";

export type InstalledWorkflowPack = {
  installSlug: string;
  name: string;
  description: string;
  defaultInstruction: string | null;
  plan: TaskPlan | null;
};

/** Packs de workflow instalados por el usuario (multiagente). */
export async function listInstalledWorkflowPacks(
  userId: string,
): Promise<InstalledWorkflowPack[]> {
  if (!extensionsEnabled()) return [];

  const { data: installs, error } = await supabaseAdmin
    .from("gafcore_extension_installs")
    .select("install_slug, version_id")
    .eq("user_id", userId)
    .eq("kind", "workflow_pack");

  if (error || !installs?.length) return [];

  const packs: InstalledWorkflowPack[] = [];
  for (const row of installs) {
    const { data: ver } = await supabaseAdmin
      .from("gafcore_extension_versions")
      .select("manifest_json")
      .eq("id", row.version_id)
      .maybeSingle();
    if (!ver?.manifest_json) continue;
    try {
      const manifest = parseExtensionManifest(ver.manifest_json);
      if (manifest.kind !== "workflow_pack") continue;
      packs.push({
        installSlug: row.install_slug,
        name: manifest.name,
        description: manifest.description,
        defaultInstruction: manifest.defaultInstruction?.trim() ?? null,
        plan: manifest.plan ?? null,
      });
    } catch {
      continue;
    }
  }
  return packs;
}

/** Primer pack instalado con plan (para precargar multiagente). */
export async function getDefaultWorkflowPackPlan(
  userId: string,
): Promise<{ plan: TaskPlan; instruction: string } | null> {
  const packs = await listInstalledWorkflowPacks(userId);
  for (const pack of packs) {
    if (!pack.plan?.tasks?.length) continue;
    return {
      plan: pack.plan,
      instruction:
        pack.defaultInstruction?.trim() ||
        pack.plan.summary ||
        `Ejecutar workflow: ${pack.name}`,
    };
  }
  return null;
}

/** Pack instalado por slug de listing (sin prefijo workflow:). */
export async function getInstalledWorkflowPackByListingSlug(
  userId: string,
  listingSlug: string,
): Promise<InstalledWorkflowPack | null> {
  const needle = `workflow:${listingSlug.replace(/^workflow:/, "")}`;
  const packs = await listInstalledWorkflowPacks(userId);
  return packs.find((p) => p.installSlug === needle) ?? null;
}
