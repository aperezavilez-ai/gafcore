/**
 * Endpoints HTTP del brand wizard — get/set sin pasar por SSR.
 */
import { z } from "zod";
import { requireGafcoreApiUser } from "@/lib/gafcore-api-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  brandSchema,
  brandSectorSchema,
  brandPresets,
  buildBrandFromInput,
  type Brand,
} from "@/lib/gafcore-brand.shared";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

async function ownsProject(userId: string, projectId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("projects")
    .select("id, user_id")
    .eq("id", projectId)
    .maybeSingle();
  return !!data?.id && (!data.user_id || data.user_id === userId);
}

const getInput = z.object({ projectId: z.string().uuid() });

export async function handleGafcoreBrandGetPost(request: Request): Promise<Response> {
  const userId = await requireGafcoreApiUser(request);
  if (userId instanceof Response) return userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  const parsed = getInput.safeParse(body);
  if (!parsed.success) return jsonResponse({ ok: false, error: "invalid_body" }, 400);

  if (!(await ownsProject(userId, parsed.data.projectId))) {
    return jsonResponse({ ok: false, error: "project_not_found" }, 404);
  }

  const { data } = await supabaseAdmin
    .from("gafcore_project_brands")
    .select("brand")
    .eq("project_id", parsed.data.projectId)
    .maybeSingle();

  if (!data?.brand) {
    return jsonResponse({ ok: true, brand: null, presets: Object.keys(brandPresets) });
  }
  const validated = brandSchema.safeParse(data.brand);
  return jsonResponse({
    ok: true,
    brand: validated.success ? (validated.data as Brand) : null,
    presets: Object.keys(brandPresets),
  });
}

const setInput = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1).max(80),
  sector: brandSectorSchema,
  mood: z.array(z.string().min(1).max(40)).min(1).max(5),
  tagline: z.string().max(200).optional(),
});

export async function handleGafcoreBrandSetPost(request: Request): Promise<Response> {
  const userId = await requireGafcoreApiUser(request);
  if (userId instanceof Response) return userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }
  const parsed = setInput.safeParse(body);
  if (!parsed.success) return jsonResponse({ ok: false, error: "invalid_body" }, 400);

  if (!(await ownsProject(userId, parsed.data.projectId))) {
    return jsonResponse({ ok: false, error: "project_not_found" }, 404);
  }

  const brand = buildBrandFromInput({
    name: parsed.data.name,
    sector: parsed.data.sector,
    mood: parsed.data.mood,
    tagline: parsed.data.tagline,
  });

  const { error } = await supabaseAdmin
    .from("gafcore_project_brands")
    .upsert(
      {
        project_id: parsed.data.projectId,
        brand,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id" },
    );

  if (error) {
    console.error("[brand-http] upsert:", error);
    return jsonResponse({ ok: false, error: "db_error" }, 500);
  }

  return jsonResponse({ ok: true, brand });
}
