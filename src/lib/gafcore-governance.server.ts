/**
 * Gobernanza GafCore — kill switch, permisos IA y auditoría (solo servidor).
 */
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isGafcoreAdminUser } from "@/lib/gafcore-admin-role.server";
import {
  GAFCORE_SYSTEM_CONTROL_KEYS,
  scoreAiRequestRisk,
  type GafcoreAiAction,
  type GafcoreAuditOutcome,
  type GafcoreRiskAssessment,
  type GafcoreSystemControlKey,
  type GafcoreSystemControlRow,
} from "@/lib/gafcore-governance.shared";

const CACHE_TTL_MS = 30_000;

type ControlsCache = {
  at: number;
  rows: GafcoreSystemControlRow[];
};

let controlsCache: ControlsCache | null = null;

const DEFAULT_CONTROLS: GafcoreSystemControlRow[] = GAFCORE_SYSTEM_CONTROL_KEYS.map((key) => ({
  key,
  enabled: key === "maintenance_mode" ? false : true,
  message: key === "maintenance_mode" ? "GafCore está en mantenimiento. Vuelve en unos minutos." : null,
  updated_at: new Date(0).toISOString(),
  updated_by: null,
}));

export function invalidateSystemControlsCache(): void {
  controlsCache = null;
}

export async function getSystemControls(): Promise<GafcoreSystemControlRow[]> {
  const now = Date.now();
  if (controlsCache && now - controlsCache.at < CACHE_TTL_MS) {
    return controlsCache.rows;
  }

  try {
    const { data, error } = await supabaseAdmin.from("system_controls").select("*");
    if (error) {
      console.warn("[governance] system_controls read:", error.message);
      return DEFAULT_CONTROLS;
    }
    const byKey = new Map(
      (data ?? []).map((r) => [
        r.key as GafcoreSystemControlKey,
        r as GafcoreSystemControlRow,
      ]),
    );
    const merged = GAFCORE_SYSTEM_CONTROL_KEYS.map(
      (key) => byKey.get(key) ?? DEFAULT_CONTROLS.find((d) => d.key === key)!,
    );
    controlsCache = { at: now, rows: merged };
    return merged;
  } catch (e) {
    console.warn("[governance] system_controls exception:", e);
    return DEFAULT_CONTROLS;
  }
}

function controlEnabled(rows: GafcoreSystemControlRow[], key: GafcoreSystemControlKey): boolean {
  return rows.find((r) => r.key === key)?.enabled ?? true;
}

function controlMessage(rows: GafcoreSystemControlRow[], key: GafcoreSystemControlKey): string {
  return rows.find((r) => r.key === key)?.message?.trim() || "";
}

export type GafcoreGovernanceResult = {
  allowed: boolean;
  blocked: boolean;
  code?: "maintenance" | "ai_disabled" | "chat_disabled" | "factory_disabled" | "publish_disabled" | "risk_blocked";
  message?: string;
  risk: GafcoreRiskAssessment;
};

export async function assertGafcoreAiGovernance(args: {
  userId: string;
  action: GafcoreAiAction;
  instruction: string;
  projectId?: string;
  fileCount?: number;
  isAdmin?: boolean;
}): Promise<GafcoreGovernanceResult> {
  const isAdmin = args.isAdmin ?? (await isGafcoreAdminUser(args.userId));
  const risk = scoreAiRequestRisk(args.instruction, {
    action: args.action,
    fileCount: args.fileCount,
  });

  if (isAdmin) {
    return { allowed: true, blocked: false, risk };
  }

  const controls = await getSystemControls();

  if (controlEnabled(controls, "maintenance_mode")) {
    const msg =
      controlMessage(controls, "maintenance_mode") ||
      "GafCore está en mantenimiento. Vuelve en unos minutos.";
    return {
      allowed: false,
      blocked: true,
      code: "maintenance",
      message: msg,
      risk,
    };
  }

  if (!controlEnabled(controls, "ai_enabled")) {
    return {
      allowed: false,
      blocked: true,
      code: "ai_disabled",
      message:
        controlMessage(controls, "ai_enabled") ||
        "La IA está temporalmente pausada. Inténtalo más tarde.",
      risk,
    };
  }

  if (
    (args.action === "chat.build" ||
      args.action === "chat.edit" ||
      args.action === "chat.complete") &&
    !controlEnabled(controls, "chat_enabled")
  ) {
    return {
      allowed: false,
      blocked: true,
      code: "chat_disabled",
      message:
        controlMessage(controls, "chat_enabled") ||
        "El chat IA está temporalmente desactivado.",
      risk,
    };
  }

  if (args.action === "factory.run" && !controlEnabled(controls, "factory_enabled")) {
    return {
      allowed: false,
      blocked: true,
      code: "factory_disabled",
      message:
        controlMessage(controls, "factory_enabled") ||
        "Factory está temporalmente desactivada.",
      risk,
    };
  }

  if (args.action === "publish.deploy" && !controlEnabled(controls, "publish_enabled")) {
    return {
      allowed: false,
      blocked: true,
      code: "publish_disabled",
      message:
        controlMessage(controls, "publish_enabled") ||
        "Publicación temporalmente desactivada.",
      risk,
    };
  }

  if (risk.blocked) {
    return {
      allowed: false,
      blocked: true,
      code: "risk_blocked",
      message:
        "Esta solicitud fue bloqueada por políticas de seguridad. Reformula tu pedido sin secretos, borrados masivos ni manipulación de pagos.",
      risk,
    };
  }

  return { allowed: true, blocked: false, risk };
}

export function hashInstructionForAudit(instruction: string): string {
  return createHash("sha256").update(instruction).digest("hex").slice(0, 16);
}

/** Fire-and-forget — no bloquea la respuesta al usuario. */
export function appendAuditEvent(args: {
  actorId?: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string;
  risk?: GafcoreRiskAssessment;
  outcome: GafcoreAuditOutcome;
  instruction?: string;
  metadata?: Record<string, unknown>;
}): void {
  void (async () => {
    try {
      const { error } = await supabaseAdmin.from("audit_events").insert({
        actor_id: args.actorId ?? null,
        action: args.action,
        resource_type: args.resourceType ?? null,
        resource_id: args.resourceId ?? null,
        risk_level: args.risk?.level ?? null,
        risk_score: args.risk?.score ?? null,
        outcome: args.outcome,
        instruction_hash: args.instruction
          ? hashInstructionForAudit(args.instruction)
          : null,
        metadata: args.metadata ?? {},
      });
      if (error) console.warn("[governance] audit insert:", error.message);
    } catch (e) {
      console.warn("[governance] audit exception:", e);
    }
  })();
}

export async function updateSystemControl(args: {
  key: GafcoreSystemControlKey;
  enabled: boolean;
  message?: string | null;
  actorId: string;
}): Promise<GafcoreSystemControlRow> {
  const { data, error } = await supabaseAdmin
    .from("system_controls")
    .upsert(
      {
        key: args.key,
        enabled: args.enabled,
        message: args.message ?? null,
        updated_by: args.actorId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    )
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  invalidateSystemControlsCache();

  appendAuditEvent({
    actorId: args.actorId,
    action: "governance.control_update",
    resourceType: "system_control",
    resourceId: args.key,
    outcome: "completed",
    metadata: { enabled: args.enabled, message: args.message ?? null },
  });

  return data as GafcoreSystemControlRow;
}

export async function enforceAiGovernanceWithAudit(args: {
  userId: string;
  action: GafcoreAiAction;
  instruction: string;
  projectId?: string;
  fileCount?: number;
  isAdmin?: boolean;
}): Promise<GafcoreGovernanceResult> {
  const gov = await assertGafcoreAiGovernance(args);
  if (gov.blocked) {
    appendAuditEvent({
      actorId: args.userId,
      action: args.action,
      resourceType: args.projectId ? "project" : undefined,
      resourceId: args.projectId,
      risk: gov.risk,
      outcome: "blocked",
      instruction: args.instruction,
      metadata: { code: gov.code },
    });
  }
  return gov;
}

export function auditAiActionCompleted(args: {
  userId: string;
  action: GafcoreAiAction;
  instruction: string;
  projectId?: string;
  risk: GafcoreRiskAssessment;
  metadata?: Record<string, unknown>;
}): void {
  appendAuditEvent({
    actorId: args.userId,
    action: args.action,
    resourceType: args.projectId ? "project" : undefined,
    resourceId: args.projectId,
    risk: args.risk,
    outcome: "completed",
    instruction: args.instruction,
    metadata: args.metadata,
  });
}

export async function listAuditEvents(args: {
  limit?: number;
  offset?: number;
}): Promise<{ events: Record<string, unknown>[]; total: number }> {
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
  const offset = Math.max(args.offset ?? 0, 0);

  const { data, error, count } = await supabaseAdmin
    .from("audit_events")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);
  return { events: data ?? [], total: count ?? 0 };
}
