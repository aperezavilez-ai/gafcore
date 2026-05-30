import { z } from "zod";
import { actionableFixSchema, type ActionableFix } from "@/services/health/gafcoreSystemicFix.shared";

export const systemicErrorTypeSchema = z.enum(["sistema", "usuario", "build_error"]);
export type SystemicErrorType = z.infer<typeof systemicErrorTypeSchema>;

export const systemicDiagnosisSchema = z.object({
  success: z.boolean(),
  errorType: systemicErrorTypeSchema,
  rootCause: z.string(),
  userFriendlyMessage: z.string(),
  /** Texto libre o objeto estructurado (package.json, deps, parche). */
  actionableFix: actionableFixSchema,
});

export type SystemicDiagnosis = z.infer<typeof systemicDiagnosisSchema>;
export type { ActionableFix, StructuredActionableFix } from "@/services/health/gafcoreSystemicFix.shared";

export type GafcoreHealthLogEstado = "fallido" | "auto_reparado";

/** Contexto normalizado enviado a Gemini para diagnóstico. */
export type GafcoreErrorContext = {
  component: string;
  route?: string;
  method?: string;
  status?: number;
  errorCode?: string;
  message?: string;
  stack?: string;
  detail?: unknown;
  userId?: string;
  projectId?: string;
};

export type SystemicDiagnosisResult = SystemicDiagnosis & {
  logId?: string;
  /** true si Gemini respondió y el JSON pasó validación */
  parsed: boolean;
  /** Modelo usado para el diagnóstico */
  model?: string;
};
