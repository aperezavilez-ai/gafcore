import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  extensionAiPluginSlug,
  extensionTemplateSlug,
  type TemplateExtensionManifest,
} from "@/extensions/manifests.shared";
import {
  extensionsEnabled,
  getMaxExtensionsPerUser,
  parseExtensionManifest,
  templateFilesFromManifest,
} from "@/extensions/extension-host.server";
import type { GafcoreTemplateFile } from "@/lib/gafcore-templates.shared";

export type CatalogListing = {
  id: string;
  slug: string;
  name: string;
  description: string;
  kind: string;
  publisherName: string;
  version: string;
  installed: boolean;
};

export async function listPublishedCatalog(
  kind?: string,
  userId?: string,
): Promise<CatalogListing[]> {
  if (!extensionsEnabled()) return [];

  let query = supabaseAdmin
    .from("gafcore_marketplace_listings")
    .select(
      "id, slug, name, description, kind, version_label, gafcore_publishers(display_name), current_version_id",
    )
    .eq("state", "published")
    .order("sort_order", { ascending: true });

  if (kind) query = query.eq("kind", kind);

  const { data: listings, error } = await query;
  if (error) {
    console.error("[extensions] catalog:", error);
    return [];
  }

  let installedIds = new Set<string>();
  if (userId) {
    const { data: installs } = await supabaseAdmin
      .from("gafcore_extension_installs")
      .select("listing_id")
      .eq("user_id", userId);
    installedIds = new Set((installs ?? []).map((i) => i.listing_id));
  }

  return (listings ?? []).map((row) => {
    const pub = row.gafcore_publishers as { display_name?: string } | null;
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description ?? "",
      kind: row.kind,
      publisherName: pub?.display_name ?? "Publisher",
      version: row.version_label ?? "1.0.0",
      installed: installedIds.has(row.id),
    };
  });
}

export async function getListingManifest(
  listingId: string,
): Promise<{ listingId: string; version: string; manifest: unknown } | null> {
  const { data: listing } = await supabaseAdmin
    .from("gafcore_marketplace_listings")
    .select("id, current_version_id, state, version_label")
    .eq("id", listingId)
    .maybeSingle();

  if (!listing?.current_version_id || listing.state !== "published") return null;

  const { data: ver } = await supabaseAdmin
    .from("gafcore_extension_versions")
    .select("manifest_json, version")
    .eq("id", listing.current_version_id)
    .maybeSingle();

  if (!ver) return null;

  return {
    listingId: listing.id,
    version: ver.version ?? listing.version_label ?? "1.0.0",
    manifest: ver.manifest_json,
  };
}

export async function installListingForUser(
  userId: string,
  listingId: string,
  projectId?: string,
): Promise<{ ok: true; installSlug: string } | { ok: false; error: string }> {
  if (!extensionsEnabled()) return { ok: false, error: "extensions_disabled" };

  const { count } = await supabaseAdmin
    .from("gafcore_extension_installs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if ((count ?? 0) >= getMaxExtensionsPerUser()) {
    return { ok: false, error: "install_limit_reached" };
  }

  const pack = await getListingManifest(listingId);
  if (!pack) return { ok: false, error: "listing_not_found" };

  const manifest = parseExtensionManifest(pack.manifest);
  if (manifest.kind !== "template" && manifest.kind !== "ai_plugin") {
    return { ok: false, error: "kind_not_supported_yet" };
  }

  const { data: listingRow } = await supabaseAdmin
    .from("gafcore_marketplace_listings")
    .select("slug, current_version_id")
    .eq("id", listingId)
    .single();

  if (!listingRow?.current_version_id) return { ok: false, error: "listing_not_found" };

  const installSlug =
    manifest.kind === "template"
      ? extensionTemplateSlug(listingRow.slug)
      : extensionAiPluginSlug(listingRow.slug);

  const { error } = await supabaseAdmin.from("gafcore_extension_installs").upsert(
    {
      user_id: userId,
      project_id: projectId ?? null,
      listing_id: listingId,
      version_id: listingRow.current_version_id,
      install_slug: installSlug,
      kind: manifest.kind,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,listing_id" },
  );

  if (error) {
    console.error("[extensions] install:", error);
    return { ok: false, error: "install_failed" };
  }

  return { ok: true, installSlug };
}

export async function uninstallListingForUser(
  userId: string,
  listingId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!extensionsEnabled()) return { ok: false, error: "extensions_disabled" };

  const { error } = await supabaseAdmin
    .from("gafcore_extension_installs")
    .delete()
    .eq("user_id", userId)
    .eq("listing_id", listingId);

  if (error) {
    console.error("[extensions] uninstall:", error);
    return { ok: false, error: "uninstall_failed" };
  }

  return { ok: true };
}

export async function loadExtensionTemplateFiles(
  userId: string,
  slug: string,
): Promise<GafcoreTemplateFile[] | null> {
  if (!extensionsEnabled() || !slug.startsWith("ext:")) return null;

  const { data: bySlug } = await supabaseAdmin
    .from("gafcore_extension_installs")
    .select("version_id")
    .eq("user_id", userId)
    .eq("install_slug", slug)
    .maybeSingle();

  const versionId = bySlug?.version_id;
  if (!versionId) return null;

  const { data: ver } = await supabaseAdmin
    .from("gafcore_extension_versions")
    .select("manifest_json")
    .eq("id", versionId)
    .maybeSingle();

  if (!ver?.manifest_json) return null;

  const manifest = parseExtensionManifest(ver.manifest_json);
  if (manifest.kind !== "template") return null;

  return templateFilesFromManifest(manifest as TemplateExtensionManifest);
}

export type UserExtensionInstall = {
  listingId: string;
  name: string;
  description: string;
  kind: string;
  version: string;
  installSlug: string;
  installedAt: string;
};

export async function listUserExtensionInstalls(userId: string): Promise<UserExtensionInstall[]> {
  if (!extensionsEnabled()) return [];

  const { data, error } = await supabaseAdmin
    .from("gafcore_extension_installs")
    .select("listing_id, kind, install_slug, created_at, version_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data?.length) return [];

  const rows: UserExtensionInstall[] = [];
  for (const row of data) {
    const { data: listing } = await supabaseAdmin
      .from("gafcore_marketplace_listings")
      .select("name, description, version_label")
      .eq("id", row.listing_id)
      .maybeSingle();
    rows.push({
      listingId: row.listing_id,
      name: listing?.name ?? row.install_slug,
      description: listing?.description ?? "",
      kind: row.kind,
      version: listing?.version_label ?? "1.0.0",
      installSlug: row.install_slug,
      installedAt: row.created_at,
    });
  }
  return rows;
}

export async function listUserTemplateSlugs(userId: string): Promise<
  Array<{ slug: string; name: string; description: string }>
> {
  if (!extensionsEnabled()) return [];

  const { data } = await supabaseAdmin
    .from("gafcore_extension_installs")
    .select("install_slug, listing_id, version_id")
    .eq("user_id", userId)
    .eq("kind", "template");

  const rows: Array<{ slug: string; name: string; description: string }> = [];
  for (const row of data ?? []) {
    const { data: listing } = await supabaseAdmin
      .from("gafcore_marketplace_listings")
      .select("name, description")
      .eq("id", row.listing_id)
      .maybeSingle();
    rows.push({
      slug: row.install_slug,
      name: listing?.name ?? row.install_slug,
      description: listing?.description ?? "",
    });
  }
  return rows;
}
