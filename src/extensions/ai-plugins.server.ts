import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { extensionsEnabled, parseExtensionManifest } from "@/extensions/extension-host.server";

/** Concatena systemPromptAppend de plugins IA instalados (hook before_chat). */
export async function buildAiPluginPromptAppend(userId: string): Promise<string> {
  if (!extensionsEnabled()) return "";

  const { data: installs, error } = await supabaseAdmin
    .from("gafcore_extension_installs")
    .select("version_id")
    .eq("user_id", userId)
    .eq("kind", "ai_plugin");

  if (error || !installs?.length) return "";

  const parts: string[] = [];
  for (const row of installs) {
    const { data: ver } = await supabaseAdmin
      .from("gafcore_extension_versions")
      .select("manifest_json")
      .eq("id", row.version_id)
      .maybeSingle();
    if (!ver?.manifest_json) continue;
    try {
      const manifest = parseExtensionManifest(ver.manifest_json);
      if (manifest.kind !== "ai_plugin") continue;
      if (!manifest.hooks.includes("before_chat")) continue;
      const text = manifest.systemPromptAppend?.trim();
      if (text) parts.push(`[Plugin: ${manifest.name}]\n${text}`);
    } catch {
      continue;
    }
  }

  return parts.join("\n\n");
}
