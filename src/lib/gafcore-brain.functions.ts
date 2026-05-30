import { createServerFn } from "@tanstack/react-start";
import { getBrainCapabilities } from "@/services/ai/aiOrchestrator.server";
import { runHealthCheck } from "@/services/health/healthCheck.server";

/** Capacidades del cerebro (proveedores + rutas por tarea). Sin secretos. */
export const getGafcoreBrainCapabilities = createServerFn({ method: "GET" }).handler(
  async () => getBrainCapabilities(),
);

/** Resumen de salud env + IA (mismo criterio que gafcore:doctor). */
export const getGafcoreHealthSummary = createServerFn({ method: "GET" }).handler(async () => {
  const summary = runHealthCheck();
  return {
    ok: summary.ok,
    criticalCount: summary.criticalCount,
    warningCount: summary.warningCount,
    findings: summary.findings.map((f) => ({
      module: f.module,
      title: f.title,
      description: f.description,
      severity: f.severity,
    })),
  };
});
