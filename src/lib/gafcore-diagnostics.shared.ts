import { z } from "zod";

export const DIAGNOSTIC_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type DiagnosticSeverity = (typeof DIAGNOSTIC_SEVERITIES)[number];

export const DIAGNOSTIC_STATUSES = [
  "pending_analysis",
  "pending_approval",
  "approved",
  "rejected",
  "deferred",
  "executing",
  "completed",
  "failed",
] as const;
export type DiagnosticStatus = (typeof DIAGNOSTIC_STATUSES)[number];

export const ADMIN_DECISIONS = ["approve", "reject", "modify", "defer"] as const;
export type AdminDecision = (typeof ADMIN_DECISIONS)[number];

export const DIAGNOSTIC_SOURCES = [
  "doctor",
  "health_cron",
  "runtime",
  "api",
  "database",
  "integration",
  "deploy",
  "manual",
  "ingest",
] as const;
export type DiagnosticSource = (typeof DIAGNOSTIC_SOURCES)[number];

/** Acciones ejecutables tras aprobación (whitelist). */
export const FIX_TYPES = [
  "run_doctor",
  "health_check_all",
  "sync_stripe_subscription",
  "replay_webhook_guidance",
] as const;
export type FixType = (typeof FIX_TYPES)[number];

export const diagnosticAnalysisSchema = z.object({
  root_cause_analysis: z.string(),
  affected_components: z.array(z.string()),
  risk_level: z.enum(["low", "medium", "high", "critical"]),
  suggested_fix: z.string(),
  alternative_fixes: z.array(z.string()).optional().default([]),
  solution_impacts: z
    .array(
      z.object({
        solution: z.string(),
        impact: z.string(),
      }),
    )
    .optional()
    .default([]),
  recommended_fix_type: z.enum(FIX_TYPES).optional(),
});

export type DiagnosticAnalysis = z.infer<typeof diagnosticAnalysisSchema>;

export type DiagnosticReportRow = {
  id: string;
  created_at: string;
  updated_at: string;
  module: string;
  title: string;
  description: string;
  possible_root_cause: string | null;
  impact: string | null;
  severity: DiagnosticSeverity;
  status: DiagnosticStatus;
  source: string;
  raw_payload: Record<string, unknown>;
  analysis_json: DiagnosticAnalysis | null;
  proposed_fix: string | null;
  modified_fix: string | null;
  admin_decision: AdminDecision | null;
  decided_by: string | null;
  decided_at: string | null;
  fix_type: string | null;
  execution_result: Record<string, unknown> | null;
  environment: string;
};

export function severityLabel(s: DiagnosticSeverity): string {
  const map: Record<DiagnosticSeverity, string> = {
    low: "Baja",
    medium: "Media",
    high: "Alta",
    critical: "Crítica",
  };
  return map[s];
}

export function statusLabel(s: DiagnosticStatus): string {
  const map: Record<DiagnosticStatus, string> = {
    pending_analysis: "Pendiente análisis",
    pending_approval: "Pendiente aprobación",
    approved: "Aprobado",
    rejected: "Rechazado",
    deferred: "Pospuesto",
    executing: "Ejecutando",
    completed: "Completado",
    failed: "Fallido",
  };
  return map[s];
}
