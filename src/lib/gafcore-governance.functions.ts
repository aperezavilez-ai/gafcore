// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireGafcoreAdmin } from "@/lib/server-fns/require-gafcore-admin.middleware";
import {
  GAFCORE_SYSTEM_CONTROL_KEYS,
  type GafcoreSystemControlKey,
} from "@/lib/gafcore-governance.shared";
import {
  getSystemControls,
  listAuditEvents,
  updateSystemControl,
} from "@/lib/gafcore-governance.server";

export const listGafcoreSystemControls = createServerFn({ method: "GET" })
  .middleware([requireGafcoreAdmin])
  .handler(async () => {
    const controls = await getSystemControls();
    return { controls };
  });

const updateControlSchema = z.object({
  key: z.enum(GAFCORE_SYSTEM_CONTROL_KEYS),
  enabled: z.boolean(),
  message: z.string().max(500).nullable().optional(),
});

export const updateGafcoreSystemControl = createServerFn({ method: "POST" })
  .middleware([requireGafcoreAdmin])
  .inputValidator((input) => updateControlSchema.parse(input))
  .handler(async ({ data, context }) => {
    const row = await updateSystemControl({
      key: data.key as GafcoreSystemControlKey,
      enabled: data.enabled,
      message: data.message,
      actorId: context.userId as string,
    });
    return { control: row };
  });

const listAuditSchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
});

export const listGafcoreAuditEvents = createServerFn({ method: "POST" })
  .middleware([requireGafcoreAdmin])
  .inputValidator((input) => listAuditSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    return listAuditEvents({ limit: data.limit, offset: data.offset });
  });
