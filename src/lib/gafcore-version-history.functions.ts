import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  listProjectVersionsServer,
  saveProjectVersionServer,
  deleteProjectVersionServer,
} from "@/lib/gafcore-version-history.server";

const fileSchema = z.object({
  name: z.string().min(1).max(512),
  content: z.string().max(500_000),
  language: z.string().max(64).optional(),
});

/** Lista versiones de un proyecto (máx 30, más reciente primero). */
export const listProjectVersionsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ projectId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const versions = await listProjectVersionsServer(
      data.projectId,
      context.user.id,
    );
    return { ok: true as const, versions };
  });

/** Guarda una versión (manual o automática). */
export const saveProjectVersionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        projectId: z.string().uuid(),
        files: z.array(fileSchema).min(1).max(100),
        label: z.string().max(200).default(""),
        isAuto: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const entry = await saveProjectVersionServer(
      data.projectId,
      context.user.id,
      data.files,
      data.label,
      data.isAuto,
    );
    if (!entry) {
      return { ok: false as const, error: "No se pudo guardar la versión" };
    }
    return { ok: true as const, entry };
  });

/** Elimina una versión específica. */
export const deleteProjectVersionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ versionId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const ok = await deleteProjectVersionServer(data.versionId, context.user.id);
    return { ok };
  });
