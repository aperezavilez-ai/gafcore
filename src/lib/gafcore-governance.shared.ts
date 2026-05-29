/**
 * Gobernanza GafCore — tipos, acciones IA y scoring de riesgo (cliente + servidor).
 */
import { isSubstantiveBuildRequest } from "@/lib/gafcore-chat-intent.shared";

export const GAFCORE_SYSTEM_CONTROL_KEYS = [
  "ai_enabled",
  "chat_enabled",
  "factory_enabled",
  "publish_enabled",
  "maintenance_mode",
] as const;

export type GafcoreSystemControlKey = (typeof GAFCORE_SYSTEM_CONTROL_KEYS)[number];

export type GafcoreAiAction =
  | "chat.build"
  | "chat.edit"
  | "chat.complete"
  | "factory.run"
  | "publish.deploy";

export type GafcoreCriticalAction = "project.delete" | "project.publish";

export type GafcoreRiskLevel = "low" | "medium" | "high" | "critical";

export type GafcoreAuditOutcome = "allowed" | "blocked" | "pending_approval" | "completed";

export type GafcoreRiskAssessment = {
  score: number;
  level: GafcoreRiskLevel;
  signals: string[];
  requiresConfirmation: boolean;
  blocked: boolean;
};

export type GafcoreSystemControlRow = {
  key: GafcoreSystemControlKey;
  enabled: boolean;
  message: string | null;
  updated_at: string;
  updated_by: string | null;
};

export type GafcoreAuditEventRow = {
  id: string;
  created_at: string;
  actor_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  risk_level: GafcoreRiskLevel | null;
  risk_score: number | null;
  outcome: GafcoreAuditOutcome;
  instruction_hash: string | null;
  metadata: Record<string, unknown>;
};

export const GAFCORE_RISK_BLOCK_THRESHOLD = 85;
export const GAFCORE_RISK_CONFIRM_THRESHOLD = 70;

const SECRET_EXFIL_RE =
  /\b(env|\.env|secret|api[_-]?key|token|password|credential|service[_-]?role|supabase[_-]?key|stripe[_-]?secret)\b/i;
const MASS_DELETE_RE =
  /\b(borra(r)?\s+todo|elimina(r)?\s+todo|delete\s+all|reset\s+(total|completo)|vaciar\s+proyecto|borrar\s+(todos\s+los\s+)?archivos)\b/i;
const BILLING_ABUSE_RE =
  /\b(cambiar\s+plan|gratis\s+ilimitado|saltar\s+pago|bypass\s+credits|hackear\s+creditos|cr[eé]ditos\s+infinitos)\b/i;
const DEPLOY_ABUSE_RE =
  /\b(ejecutar\s+sql|drop\s+table|rm\s+-rf|child_process|eval\s*\(|Function\s*\()\b/i;

export function riskLevelFromScore(score: number): GafcoreRiskLevel {
  if (score >= 85) return "critical";
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

/** Heurística de riesgo — no bloquea flujo normal de builds creativos. */
export function scoreAiRequestRisk(
  instruction: string,
  ctx?: { action?: GafcoreAiAction; fileCount?: number },
): GafcoreRiskAssessment {
  const t = instruction.trim();
  const signals: string[] = [];
  let score = 0;

  if (SECRET_EXFIL_RE.test(t)) {
    score += 50;
    signals.push("secret_exfiltration");
  }
  if (MASS_DELETE_RE.test(t)) {
    score += 45;
    signals.push("mass_delete");
  }
  if (BILLING_ABUSE_RE.test(t)) {
    score += 40;
    signals.push("billing_abuse");
  }
  if (DEPLOY_ABUSE_RE.test(t)) {
    score += 55;
    signals.push("code_injection");
  }
  if (/\b(publicar|deploy|producci[oó]n)\b/i.test(t) && ctx?.action === "chat.build") {
    score += 10;
    signals.push("publish_intent_in_build");
  }
  if ((ctx?.fileCount ?? 0) >= 60) {
    score += 15;
    signals.push("large_context");
  }
  if (t.length > 6000) {
    score += 10;
    signals.push("very_long_instruction");
  }

  score = Math.min(100, score);
  const level = riskLevelFromScore(score);
  const blocked = score >= GAFCORE_RISK_BLOCK_THRESHOLD;
  const requiresConfirmation =
    !blocked && score >= GAFCORE_RISK_CONFIRM_THRESHOLD;

  return { score, level, signals, requiresConfirmation, blocked };
}

export function systemControlLabel(key: GafcoreSystemControlKey): string {
  const labels: Record<GafcoreSystemControlKey, string> = {
    ai_enabled: "IA global",
    chat_enabled: "Chat IDE",
    factory_enabled: "Factory / multi-agente",
    publish_enabled: "Publicar / deploy",
    maintenance_mode: "Modo mantenimiento",
  };
  return labels[key];
}

export function auditOutcomeLabel(outcome: GafcoreAuditOutcome): string {
  const labels: Record<GafcoreAuditOutcome, string> = {
    allowed: "Permitido",
    blocked: "Bloqueado",
    pending_approval: "Pendiente",
    completed: "Completado",
  };
  return labels[outcome];
}

export function resolveChatAiAction(instruction: string): GafcoreAiAction {
  return isSubstantiveBuildRequest(instruction) ? "chat.build" : "chat.edit";
}

export function governanceBlockedHttpStatus(code?: string): number {
  return code === "risk_blocked" ? 403 : 503;
}

export function criticalActionLabel(action: GafcoreCriticalAction): string {
  return action === "project.delete" ? "Eliminar proyecto" : "Publicar proyecto";
}
