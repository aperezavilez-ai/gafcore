import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireGafcoreAdmin } from "@/lib/server-fns/require-gafcore-admin.middleware";
import {
  listAdminMarketplaceListings,
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
});

export const publishAdminMarketplaceListingFn = createServerFn({ method: "POST" })
  .middleware([requireGafcoreAdmin])
  .inputValidator((input) => publishSchema.parse(input))
  .handler(async ({ data }) => {
    const result = await upsertListingFromManifest(data);
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
