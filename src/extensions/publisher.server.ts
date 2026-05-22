import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  extensionsEnabled,
  parseExtensionManifest,
} from "@/extensions/extension-host.server";
import { extensionManifestSchema } from "@/extensions/manifests.shared";

export type AdminListingRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  kind: string;
  state: string;
  versionLabel: string;
  updatedAt: string;
};

export async function listAdminMarketplaceListings(): Promise<AdminListingRow[]> {
  if (!extensionsEnabled()) return [];

  const { data, error } = await supabaseAdmin
    .from("gafcore_marketplace_listings")
    .select("id, slug, name, description, kind, state, version_label, updated_at")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[publisher] list:", error);
    return [];
  }

  return (data ?? []).map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description ?? "",
    kind: r.kind,
    state: r.state,
    versionLabel: r.version_label ?? "1.0.0",
    updatedAt: r.updated_at,
  }));
}

export async function setListingState(
  listingId: string,
  state: "draft" | "review" | "published" | "revoked",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabaseAdmin
    .from("gafcore_marketplace_listings")
    .update({ state, updated_at: new Date().toISOString() })
    .eq("id", listingId);

  if (error) {
    console.error("[publisher] state:", error);
    return { ok: false, error: "state_update_failed" };
  }
  return { ok: true };
}

export async function upsertListingFromManifest(input: {
  publisherSlug: string;
  listingSlug: string;
  name: string;
  description: string;
  kind: "template" | "ai_plugin" | "agent";
  versionLabel: string;
  manifestJson: string;
  publish: boolean;
}): Promise<{ ok: true; listingId: string } | { ok: false; error: string }> {
  if (!extensionsEnabled()) return { ok: false, error: "extensions_disabled" };

  let manifestRaw: unknown;
  try {
    manifestRaw = JSON.parse(input.manifestJson) as unknown;
  } catch {
    return { ok: false, error: "invalid_json" };
  }

  const parsed = extensionManifestSchema.safeParse(manifestRaw);
  if (!parsed.success) {
    return { ok: false, error: "invalid_manifest" };
  }

  try {
    parseExtensionManifest(parsed.data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "manifest_validation_failed";
    return { ok: false, error: msg };
  }

  if (parsed.data.kind !== input.kind) {
    return { ok: false, error: "kind_mismatch" };
  }

  if (parsed.data.kind === "template" && parsed.data.slug !== input.listingSlug) {
    return { ok: false, error: "template_slug_must_match_listing" };
  }
  if (parsed.data.kind === "agent" && parsed.data.slug !== input.listingSlug) {
    return { ok: false, error: "agent_slug_must_match_listing" };
  }

  const { data: publisher } = await supabaseAdmin
    .from("gafcore_publishers")
    .select("id")
    .eq("slug", input.publisherSlug)
    .maybeSingle();

  let publisherId = publisher?.id;
  if (!publisherId) {
    const { data: created, error: pubErr } = await supabaseAdmin
      .from("gafcore_publishers")
      .insert({
        slug: input.publisherSlug,
        display_name: input.publisherSlug,
        verified: true,
      })
      .select("id")
      .single();
    if (pubErr || !created?.id) return { ok: false, error: "publisher_create_failed" };
    publisherId = created.id;
  }

  const state = input.publish ? "published" : "draft";

  const { data: listing, error: listErr } = await supabaseAdmin
    .from("gafcore_marketplace_listings")
    .upsert(
      {
        publisher_id: publisherId,
        slug: input.listingSlug,
        name: input.name,
        description: input.description,
        kind: input.kind,
        state,
        version_label: input.versionLabel,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();

  if (listErr || !listing?.id) {
    console.error("[publisher] listing:", listErr);
    return { ok: false, error: "listing_upsert_failed" };
  }

  const { data: version, error: verErr } = await supabaseAdmin
    .from("gafcore_extension_versions")
    .upsert(
      {
        listing_id: listing.id,
        version: input.versionLabel,
        manifest_json: parsed.data,
        content_hash: `admin-${Date.now()}`,
      },
      { onConflict: "listing_id,version" },
    )
    .select("id")
    .single();

  if (verErr || !version?.id) {
    console.error("[publisher] version:", verErr);
    return { ok: false, error: "version_upsert_failed" };
  }

  await supabaseAdmin
    .from("gafcore_marketplace_listings")
    .update({
      current_version_id: version.id,
      state,
      updated_at: new Date().toISOString(),
    })
    .eq("id", listing.id);

  return { ok: true, listingId: listing.id };
}
