/**
 * Punto de entrada del agente sistémico (re-exporta implementación servidor).
 * Usar `diagnoseAndRepair` / `scheduleSystemicDiagnosis` desde rutas API y libs `.server.ts`.
 */
export {
  diagnoseAndRepair,
  scheduleSystemicDiagnosis,
  SYSTEMIC_DIAGNOSIS_MODEL,
} from "@/services/health/gafcoreSystemic.server";

export type {
  GafcoreErrorContext,
  GafcoreHealthLogEstado,
  SystemicDiagnosis,
  SystemicDiagnosisResult,
  SystemicErrorType,
} from "@/services/health/gafcoreSystemic.types.shared";

export {
  systemicDiagnosisSchema,
  systemicErrorTypeSchema,
} from "@/services/health/gafcoreSystemic.types.shared";
