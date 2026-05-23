import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  extensionsEnabled,
  parseExtensionManifest,
} from "@/extensions/extension-host.server";
import { extensionManifestSchema } from "@/extensions/manifests.shared";
import { notifyMarketplaceReviewSubmitted } from "@/extensions/marketplace-review-notify.server";

export type AdminListingRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  kind: string;
  state: string;
  versionLabel: string;
  updatedAt: string;
  priceCents: number;
};

export type PublisherIdentity = {
  publisherId: string;
  slug: string;
  displayName: string;
};

function mapListingRow(r: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  kind: string;
  state: string;
  version_label: string | null;
  updated_at: string;
  price_cents?: number | null;
}): AdminListingRow {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description ?? "",
    kind: r.kind,
    state: r.state,
    versionLabel: r.version_label ?? "1.0.0",
    updatedAt: r.updated_at,
    priceCents: r.price_cents ?? 0,
  };
}

export async function listAdminMarketplaceListings(): Promise<AdminListingRow[]> {
  if (!extensionsEnabled()) return [];

  const { data, error } = await supabaseAdmin
    .from("gafcore_marketplace_listings")
    .select(
      "id, slug, name, description, kind, state, version_label, updated_at, price_cents",
    )
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[publisher] list:", error);
    return [];
  }

  return (data ?? []).map(mapListingRow);
}

/** Publisher vinculado al usuario (creador). */
export async function ensurePublisherForUser(
  userId: string,
): Promise<{ ok: true; publisher: PublisherIdentity } | { ok: false; error: string }> {
  if (!extensionsEnabled()) return { ok: false, error: "extensions_disabled" };

  const { data: existing } = await supabaseAdmin
    .from("gafcore_publishers")
    .select("id, slug, display_name")
    .eq("owner_user_id", userId)
    .maybeSingle();

  if (existing?.id) {
    return {
      ok: true,
      publisher: {
        publisherId: existing.id,
        slug: existing.slug,
        displayName: existing.display_name,
      },
    };
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("first_name, artist_name, email")
    .eq("user_id", userId)
    .maybeSingle();

  const rawName =
    profile?.artist_name?.trim() ||
    profile?.first_name?.trim() ||
    profile?.email?.split("@")[0] ||
    "creator";
  const baseSlug = rawName
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  const suffix = userId.replace(/-/g, "").slice(0, 6);
  let slug = baseSlug ? `${baseSlug}-${suffix}` : `creator-${suffix}`;
  if (slug.length < 3) slug = `creator-${suffix}`;

  for (let attempt = 0; attempt < 5; attempt++) {
    const trySlug = attempt === 0 ? slug : `${slug}-${attempt}`;
    const { data: created, error: pubErr } = await supabaseAdmin
      .from("gafcore_publishers")
      .insert({
        slug: trySlug,
        display_name: rawName,
        verified: false,
        owner_user_id: userId,
      })
      .select("id, slug, display_name")
      .single();

    if (!pubErr && created?.id) {
      return {
        ok: true,
        publisher: {
          publisherId: created.id,
          slug: created.slug,
          displayName: created.display_name,
        },
      };
    }
    if (pubErr?.code !== "23505") {
      console.error("[publisher] ensure:", pubErr);
      return { ok: false, error: "publisher_create_failed" };
    }
  }

  return { ok: false, error: "publisher_create_failed" };
}

export async function listCreatorMarketplaceListings(
  userId: string,
): Promise<AdminListingRow[]> {
  if (!extensionsEnabled()) return [];

  const ensured = await ensurePublisherForUser(userId);
  if (!ensured.ok) return [];

  const { data, error } = await supabaseAdmin
    .from("gafcore_marketplace_listings")
    .select(
      "id, slug, name, description, kind, state, version_label, updated_at, price_cents",
    )
    .eq("publisher_id", ensured.publisher.publisherId)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[publisher] creator list:", error);
    return [];
  }

  return (data ?? []).map(mapListingRow);
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
  /** Si está definido, el listing queda en `review` al enviar (no publicación directa). */
  creatorUserId?: string;
  priceCents?: number;
  currency?: string;
}): Promise<{ ok: true; listingId: string; state: string } | { ok: false; error: string }> {
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

  let publisherId: string | undefined;

  if (input.creatorUserId) {
    const ensured = await ensurePublisherForUser(input.creatorUserId);
    if (!ensured.ok) return { ok: false, error: ensured.error };
    publisherId = ensured.publisher.publisherId;
  } else {
    const { data: publisher } = await supabaseAdmin
      .from("gafcore_publishers")
      .select("id")
      .eq("slug", input.publisherSlug)
      .maybeSingle();

    publisherId = publisher?.id;
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
  }

  const priceCents = Math.max(0, Math.floor(input.priceCents ?? 0));
  const currency = (input.currency ?? "eur").trim().toLowerCase() || "eur";
  const state = input.creatorUserId
    ? input.publish
      ? "review"
      : "draft"
    : input.publish
      ? "published"
      : "draft";

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
        price_cents: priceCents,
        currency,
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

  if (state === "review") {
    void notifyMarketplaceReviewSubmitted({
      listingId: listing.id,
      slug: input.listingSlug,
      name: input.name,
      kind: input.kind,
      creatorUserId: input.creatorUserId,
    });
  }

  return { ok: true, listingId: listing.id, state };
}
