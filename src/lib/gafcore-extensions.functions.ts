import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { listActiveAiPluginNames } from "@/extensions/ai-plugins.server";
import {
  getListingManifest,
  installListingForUser,
  listPublishedCatalog,
  listUserExtensionInstalls,
  uninstallListingForUser,
} from "@/extensions/marketplace.server";

export const listGafcoreExtensionsCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ kind: z.enum(["template", "ai_plugin", "agent", "workflow_pack"]).optional() }).parse(
      input,
    ),
  )
  .handler(async ({ data, context }) => {
    const listings = await listPublishedCatalog(data.kind, context.userId!);
    return { ok: true as const, listings };
  });

const manifestSchema = z.object({ listingId: z.string().uuid() });

export const getGafcoreExtensionManifest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => manifestSchema.parse(input))
  .handler(async ({ data }) => {
    const pack = await getListingManifest(data.listingId);
    if (!pack) return { ok: false as const, error: "not_found" };
    return { ok: true as const, ...pack };
  });

const installSchema = z.object({
  listingId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
});

export const installGafcoreExtension = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => installSchema.parse(input))
  .handler(async ({ data, context }) => {
    const result = await installListingForUser(context.userId!, data.listingId, data.projectId);
    if (!result.ok) return { ok: false as const, error: result.error };
    return { ok: true as const, installSlug: result.installSlug };
  });

export const uninstallGafcoreExtension = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => installSchema.pick({ listingId: true }).parse(input))
  .handler(async ({ data, context }) => {
    const result = await uninstallListingForUser(context.userId!, data.listingId);
    if (!result.ok) return { ok: false as const, error: result.error };
    return { ok: true as const };
  });

export const listGafcoreUserInstalls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const installs = await listUserExtensionInstalls(context.userId!);
    return { ok: true as const, installs };
  });

export const listGafcoreActiveAiPlugins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const names = await listActiveAiPluginNames(context.userId!);
    return { ok: true as const, names };
  });
