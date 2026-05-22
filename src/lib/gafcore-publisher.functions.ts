import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireGafcoreAdmin } from "@/lib/server-fns/require-gafcore-admin.middleware";
import {
  ensurePublisherForUser,
  listAdminMarketplaceListings,
  listCreatorMarketplaceListings,
  setListingState,
  upsertListingFromManifest,
} from "@/extensions/publisher.server";

export const listAdminMarketplaceListingsFn = createServerFn({ method: "POST" })
  .middleware([requireGafcoreAdmin])
  .handler(async () => {
    const listings = await listAdminMarketplaceListings();
    return { ok: true as const, listings };
  });

const publishSchema = z.object({
  publisherSlug: z.string().min(1).max(80).default("gafcore-labs"),
  listingSlug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(""),
  kind: z.enum(["template", "ai_plugin", "agent"]),
  versionLabel: z.string().min(1).max(32).default("1.0.0"),
  manifestJson: z.string().min(2).max(500_000),
  publish: z.boolean().default(true),
  priceCents: z.number().int().min(0).max(999_999).default(0),
  currency: z.string().min(3).max(3).default("eur"),
});

export const publishAdminMarketplaceListingFn = createServerFn({ method: "POST" })
  .middleware([requireGafcoreAdmin])
  .inputValidator((input) => publishSchema.parse(input))
  .handler(async ({ data }) => {
    const result = await upsertListingFromManifest({
      ...data,
      priceCents: data.priceCents,
      currency: data.currency,
    });
    if (!result.ok) return { ok: false as const, error: result.error };
    return { ok: true as const, listingId: result.listingId };
  });

const stateSchema = z.object({
  listingId: z.string().uuid(),
  state: z.enum(["draft", "review", "published", "revoked"]),
});

export const setAdminMarketplaceListingStateFn = createServerFn({ method: "POST" })
  .middleware([requireGafcoreAdmin])
  .inputValidator((input) => stateSchema.parse(input))
  .handler(async ({ data }) => {
    const result = await setListingState(data.listingId, data.state);
    if (!result.ok) return { ok: false as const, error: result.error };
    return { ok: true as const };
  });

export const getMyGafcorePublisherFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const result = await ensurePublisherForUser(context.userId);
    if (!result.ok) return { ok: false as const, error: result.error };
    return { ok: true as const, publisher: result.publisher };
  });

export const listMyMarketplaceListingsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const listings = await listCreatorMarketplaceListings(context.userId);
    return { ok: true as const, listings };
  });

const creatorPublishSchema = publishSchema.omit({ publisherSlug: true });

export const submitCreatorMarketplaceListingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => creatorPublishSchema.parse(input))
  .handler(async ({ data, context }) => {
    const ensured = await ensurePublisherForUser(context.userId);
    if (!ensured.ok) return { ok: false as const, error: ensured.error };

    const result = await upsertListingFromManifest({
      publisherSlug: ensured.publisher.slug,
      listingSlug: data.listingSlug,
      name: data.name,
      description: data.description,
      kind: data.kind,
      versionLabel: data.versionLabel,
      manifestJson: data.manifestJson,
      publish: data.publish,
      creatorUserId: context.userId,
      priceCents: 0,
    });
    if (!result.ok) return { ok: false as const, error: result.error };
    return { ok: true as const, listingId: result.listingId, state: result.state };
  });
