export type { DiagnosticFinding } from "@/lib/gafcore-diagnostics-checks.server";

export type HealthCheckSummary = {
  ok: boolean;
  criticalCount: number;
  warningCount: number;
  findings: import("@/lib/gafcore-diagnostics-checks.server").DiagnosticFinding[];
};
