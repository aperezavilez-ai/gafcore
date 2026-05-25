import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  brandSchema,
  brandSectorSchema,
  buildBrandFromInput,
  type Brand,
} from "@/lib/gafcore-brand.shared";

const projectIdInput = z.object({ projectId: z.string().uuid() });

/** Devuelve el brand del proyecto o null. */
export const getGafcoreProjectBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => projectIdInput.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId as string;

    const { data: proj } = await supabaseAdmin
      .from("projects")
      .select("id, user_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!proj?.id || (proj.user_id && proj.user_id !== userId)) {
      return { ok: false as const, error: "project_not_found" };
    }

    const { data: row, error } = await supabaseAdmin
      .from("gafcore_project_brands")
      .select("brand")
      .eq("project_id", data.projectId)
      .maybeSingle();

    if (error) {
      console.error("[brand] get:", error);
      return { ok: false as const, error: "db_error" };
    }
    if (!row?.brand) return { ok: true as const, brand: null };

    const parsed = brandSchema.safeParse(row.brand);
    if (!parsed.success) {
      console.warn("[brand] invalid stored brand", parsed.error.message);
      return { ok: true as const, brand: null };
    }
    return { ok: true as const, brand: parsed.data as Brand };
  });

const setBrandInput = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(80),
  sector: brandSectorSchema,
  mood: z.array(z.string().min(1).max(40)).min(1).max(5),
  tagline: z.string().max(200).optional(),
});

/** Crea o reemplaza el brand del proyecto a partir de input mínimo + preset. */
export const setGafcoreProjectBrand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => setBrandInput.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId as string;

    const { data: proj } = await supabaseAdmin
      .from("projects")
      .select("id, user_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!proj?.id || (proj.user_id && proj.user_id !== userId)) {
      return { ok: false as const, error: "project_not_found" };
    }

    const brand = buildBrandFromInput({
      name: data.name,
      sector: data.sector,
      mood: data.mood,
      tagline: data.tagline,
    });

    const { error } = await supabaseAdmin
      .from("gafcore_project_brands")
      .upsert(
        { project_id: data.projectId, brand, updated_at: new Date().toISOString() },
        { onConflict: "project_id" },
      );

    if (error) {
      console.error("[brand] upsert:", error);
      return { ok: false as const, error: "db_error" };
    }
    return { ok: true as const, brand };
  });

/** Helper interno servidor: obtiene el brand sin auth (para inyectar en system prompt del cerebro). */
export async function readProjectBrand(projectId: string | null | undefined): Promise<Brand | null> {
  if (!projectId) return null;
  const { data, error } = await supabaseAdmin
    .from("gafcore_project_brands")
    .select("brand")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error || !data?.brand) return null;
  const parsed = brandSchema.safeParse(data.brand);
  return parsed.success ? parsed.data : null;
}
