import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isGafcoreAdminUser } from "@/lib/gafcore-admin-role.server";
import { loadFactoryAdminDashboard } from "@/lib/gafcore-factory-admin.server";
import { listFactoryTemplateProfiles } from "@/lib/gafcore-factory-templates.shared";

export const getGafcoreFactoryAdminDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        limit: z.number().int().min(1).max(80).optional(),
        profileFilter: z.string().min(1).max(32).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId!;
    if (!(await isGafcoreAdminUser(userId))) {
      return { ok: false as const, error: "forbidden" as const };
    }
    const dashboard = await loadFactoryAdminDashboard(
      data.limit ?? 40,
      data.profileFilter ?? null,
    );
    return { ok: true as const, dashboard };
  });

export const listGafcoreFactoryTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(() => ({}))
  .handler(async ({ context }) => {
    const userId = context.userId!;
    if (!(await isGafcoreAdminUser(userId))) {
      return { ok: false as const, error: "forbidden" as const };
    }
    return { ok: true as const, profiles: listFactoryTemplateProfiles() };
  });
