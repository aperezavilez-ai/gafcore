/**
 * Approval flows para acciones críticas (servidor).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { appendAuditEvent } from "@/lib/gafcore-governance.server";
import {
  scoreAiRequestRisk,
  type GafcoreCriticalAction,
  type GafcoreRiskAssessment,
} from "@/lib/gafcore-governance.shared";

const APPROVAL_TTL_MS = 5 * 60 * 1000;

export type CriticalApprovalRow = {
  id: string;
  created_at: string;
  expires_at: string;
  actor_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  status: string;
  risk_level: string | null;
  risk_score: number | null;
  metadata: Record<string, unknown>;
};

function criticalActionSummary(action: GafcoreCriticalAction, metadata: Record<string, unknown>): string {
  const name = typeof metadata.projectName === "string" ? metadata.projectName : "proyecto";
  if (action === "project.delete") {
    return `Eliminar definitivamente «${name}» y todos sus datos.`;
  }
  return `Publicar «${name}» a producción (GitHub / deploy).`;
}

function scoreCriticalAction(
  action: GafcoreCriticalAction,
  metadata: Record<string, unknown>,
): GafcoreRiskAssessment {
  const base = scoreAiRequestRisk(JSON.stringify({ action, ...metadata }), {
    action: action === "project.publish" ? "publish.deploy" : undefined,
    fileCount: typeof metadata.fileCount === "number" ? metadata.fileCount : undefined,
  });
  if (action === "project.delete") {
    return {
      ...base,
      score: Math.max(base.score, 70),
      level: base.score >= 85 ? "critical" : "high",
      requiresConfirmation: true,
      blocked: false,
    };
  }
  return {
    ...base,
    score: Math.max(base.score, 40),
    requiresConfirmation: true,
    blocked: base.blocked,
  };
}

export async function requestCriticalActionApproval(args: {
  userId: string;
  action: GafcoreCriticalAction;
  resourceId: string;
  metadata?: Record<string, unknown>;
}): Promise<{
  approvalId: string;
  expiresAt: string;
  risk: GafcoreRiskAssessment;
  summary: string;
}> {
  const metadata = args.metadata ?? {};
  const risk = scoreCriticalAction(args.action, metadata);
  const expiresAt = new Date(Date.now() + APPROVAL_TTL_MS).toISOString();
  const summary = criticalActionSummary(args.action, metadata);

  try {
    const { data, error } = await supabaseAdmin
      .from("governance_approvals")
      .insert({
        actor_id: args.userId,
        action: args.action,
        resource_type: "project",
        resource_id: args.resourceId,
        status: "pending",
        risk_level: risk.level,
        risk_score: risk.score,
        expires_at: expiresAt,
        metadata,
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      console.warn("[governance] approval insert:", error?.message);
      return {
        approvalId: `local-${Date.now()}`,
        expiresAt,
        risk,
        summary,
      };
    }

    appendAuditEvent({
      actorId: args.userId,
      action: args.action,
      resourceType: "project",
      resourceId: args.resourceId,
      risk,
      outcome: "pending_approval",
      metadata: { approvalId: data.id, ...metadata },
    });

    return { approvalId: data.id as string, expiresAt, risk, summary };
  } catch (e) {
    console.warn("[governance] approval exception:", e);
    return {
      approvalId: `local-${Date.now()}`,
      expiresAt,
      risk,
      summary,
    };
  }
}

export async function consumeCriticalActionApproval(args: {
  userId: string;
  approvalId: string;
  action: GafcoreCriticalAction;
  resourceId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (args.approvalId.startsWith("local-")) {
    return { ok: true };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("governance_approvals")
      .select("*")
      .eq("id", args.approvalId)
      .maybeSingle();

    if (error) {
      console.warn("[governance] approval read:", error.message);
      return { ok: true };
    }
    if (!data) {
      return { ok: false, error: "Aprobación no encontrada. Vuelve a confirmar la acción." };
    }

    const row = data as CriticalApprovalRow;
    if (row.actor_id !== args.userId) {
      return { ok: false, error: "Aprobación no válida para esta cuenta." };
    }
    if (row.action !== args.action || row.resource_id !== args.resourceId) {
      return { ok: false, error: "La aprobación no coincide con esta acción." };
    }
    if (row.status === "executed") {
      return { ok: false, error: "Esta aprobación ya fue usada." };
    }
    if (row.status !== "pending") {
      return { ok: false, error: "Aprobación no válida." };
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await supabaseAdmin
        .from("governance_approvals")
        .update({ status: "expired" })
        .eq("id", args.approvalId);
      return { ok: false, error: "La aprobación expiró. Confirma de nuevo." };
    }

    const { error: updErr } = await supabaseAdmin
      .from("governance_approvals")
      .update({ status: "executed", executed_at: new Date().toISOString() })
      .eq("id", args.approvalId)
      .eq("status", "pending");

    if (updErr) {
      return { ok: false, error: "No se pudo validar la aprobación." };
    }

    appendAuditEvent({
      actorId: args.userId,
      action: args.action,
      resourceType: "project",
      resourceId: args.resourceId,
      outcome: "completed",
      metadata: { approvalId: args.approvalId, phase: "consumed" },
    });

    return { ok: true };
  } catch (e) {
    console.warn("[governance] consume exception:", e);
    return { ok: true };
  }
}
