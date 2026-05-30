import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { diagnoseAndRepair } from "@/services/health/gafcoreSystemic.server";
import { sanitizeDiagnosisForUser } from "@/lib/gafcore-user-facing-errors";

const debugInputSchema = z.object({
  scenario: z.enum(["broken_import", "logic_error", "map_load_failure"]),
  message: z.string().max(4000).optional(),
  stack: z.string().max(8000).optional(),
});

/** QA: ejecuta diagnoseAndRepair con contexto de error simulado (sin secretos al cliente). */
export const runGafcoreHealthDebugDiagnosis = createServerFn({ method: "POST" })
  .inputValidator((input) => debugInputSchema.parse(input))
  .handler(async ({ data }) => {
    const diagnosis = await diagnoseAndRepair({
      component: "gafcore.debug_health",
      errorCode: data.scenario,
      message: data.message ?? `Escenario QA: ${data.scenario}`,
      stack: data.stack,
      detail: { scenario: data.scenario, source: "DebugHealth.tsx" },
    });

    return {
      success: diagnosis.success,
      errorType: diagnosis.errorType,
      rootCause: diagnosis.rootCause,
      userFriendlyMessage: sanitizeDiagnosisForUser(diagnosis),
      actionableFix:
        typeof diagnosis.actionableFix === "string"
          ? diagnosis.actionableFix
          : diagnosis.actionableFix
            ? JSON.stringify(diagnosis.actionableFix)
            : null,
      parsed: diagnosis.parsed,
      logId: diagnosis.logId,
      model: diagnosis.model,
    };
  });
