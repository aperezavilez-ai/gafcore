// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireGafcoreAdmin } from "@/lib/server-fns/require-gafcore-admin.middleware";
import {
  GAFCORE_SYSTEM_CONTROL_KEYS,
  type GafcoreCriticalAction,
  type GafcoreSystemControlKey,
} from "@/lib/gafcore-governance.shared";
import { requestCriticalActionApproval } from "@/lib/gafcore-governance-approval.server";
import {
  exportAuditEventsCsv,
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

const requestApprovalSchema = z.object({
  action: z.enum(["project.delete", "project.publish"]),
  projectId: z.string().uuid(),
  projectName: z.string().max(200).optional(),
  fileCount: z.number().int().min(0).optional(),
});

/** Solicita token de aprobación antes de delete/publish (control humano). */
export const requestGafcoreCriticalApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => requestApprovalSchema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId as string;
    return requestCriticalActionApproval({
      userId,
      action: data.action as GafcoreCriticalAction,
      resourceId: data.projectId,
      metadata: {
        projectName: data.projectName,
        fileCount: data.fileCount,
      },
    });
  });

const exportAuditSchema = z.object({
  limit: z.number().int().min(1).max(10_000).optional(),
});

export const exportGafcoreAuditCsv = createServerFn({ method: "POST" })
  .middleware([requireGafcoreAdmin])
  .inputValidator((input) => exportAuditSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    const csv = await exportAuditEventsCsv(data.limit ?? 5000);
    const stamp = new Date().toISOString().slice(0, 10);
    return { csv, filename: `gafcore-audit-${stamp}.csv` };
  });
