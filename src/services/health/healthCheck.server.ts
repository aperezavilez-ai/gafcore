/**
 * Diagnóstico de salud GafCore — envuelve el doctor existente + cerebro IA.
 */
import { runEnvDoctorChecks } from "@/lib/gafcore-diagnostics-checks.server";
import { getBrainCapabilities } from "@/services/ai/aiOrchestrator.server";
import type { HealthCheckSummary } from "@/services/health/types.shared";

export function runHealthCheck(): HealthCheckSummary {
  const findings = runEnvDoctorChecks();

  const brain = getBrainCapabilities();
  if (!brain.aiReady) {
    findings.push({
      module: "brain",
      title: "Cerebro IA sin proveedor de chat",
      description:
        "Define GPTPRO4ALL_API_KEY, OPENROUTER_API_KEY, OPENAI_API_KEY, o AI_CHAT_COMPLETIONS_URL + AI_API_KEY.",
      severity: "critical",
      source: "doctor",
    });
  }

  const criticalCount = findings.filter((f) => f.severity === "critical").length;
  const warningCount = findings.filter((f) => f.severity === "warning").length;

  return {
    ok: criticalCount === 0,
    criticalCount,
    warningCount,
    findings,
  };
}
