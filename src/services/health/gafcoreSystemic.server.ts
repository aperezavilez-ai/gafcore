/**
 * Agente de diagnóstico sistémico GafCore — análisis con Gemini Flash + historial Supabase.
 * Solo servidor. Importar desde rutas API o libs `.server.ts`.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { completeChatMessage, tryGetGafcoreAiGateway } from "@/lib/gafcore-ai-gateway.server";
import { parseJsonLoose } from "@/lib/gafcore-json-loose.shared";
import {
  systemicDiagnosisSchema,
  type GafcoreErrorContext,
  type GafcoreHealthLogEstado,
  type SystemicDiagnosis,
  type SystemicDiagnosisResult,
} from "@/services/health/gafcoreSystemic.types.shared";
import {
  hasUsableActionableFix,
  normalizeSystemicDiagnosisLoose,
} from "@/services/health/gafcoreSystemicFix.shared";

/** Gemini 2.5 Flash (rápido) — sobrescribible con AI_MODEL_SYSTEMIC o AI_MODEL_FAST. */
export const SYSTEMIC_DIAGNOSIS_MODEL =
  process.env.AI_MODEL_SYSTEMIC?.trim() ||
  process.env.AI_MODEL_FAST?.trim() ||
  "google/gemini-2.5-flash";

const SYSTEMIC_DIAGNOSIS_SYSTEM = `Diagnóstico interno GafCore. Responde SOLO JSON:
{"success":bool,"errorType":"sistema"|"usuario"|"build_error","rootCause":"técnico ES","userFriendlyMessage":"empático ES sin secretos ni nombres de proveedor","actionableFix":string|object|null}
build_error+deps: actionableFix puede ser {"moduleToUpdate":"package.json","requiredDependency":{"axios":"^1.7.0"}} — solo npm, NO Python (requests).
userFriendlyMessage: nunca API keys, env vars ni stack traces.`;

function fallbackDiagnosis(ctx: GafcoreErrorContext, reason: string): SystemicDiagnosis {
  return {
    success: false,
    errorType: "sistema",
    rootCause: reason,
    userFriendlyMessage:
      "Ocurrió un problema técnico en GafCore. Intenta de nuevo en unos minutos; si persiste, contacta soporte.",
    actionableFix: null,
  };
}

function normalizeErrorContext(errorContext: unknown): GafcoreErrorContext {
  if (!errorContext || typeof errorContext !== "object") {
    return {
      component: "unknown",
      message: String(errorContext ?? "unknown_error"),
    };
  }
  const o = errorContext as Record<string, unknown>;
  return {
    component: typeof o.component === "string" ? o.component : "unknown",
    route: typeof o.route === "string" ? o.route : undefined,
    method: typeof o.method === "string" ? o.method : undefined,
    status: typeof o.status === "number" ? o.status : undefined,
    errorCode: typeof o.errorCode === "string" ? o.errorCode : undefined,
    message: typeof o.message === "string" ? o.message : undefined,
    stack: typeof o.stack === "string" ? o.stack.slice(0, 2000) : undefined,
    detail: o.detail,
    userId: typeof o.userId === "string" ? o.userId : undefined,
    projectId: typeof o.projectId === "string" ? o.projectId : undefined,
  };
}

function serializeOriginalError(ctx: GafcoreErrorContext): string {
  const payload = {
    component: ctx.component,
    route: ctx.route,
    method: ctx.method,
    status: ctx.status,
    errorCode: ctx.errorCode,
    message: ctx.message,
    stack: ctx.stack,
    detail: ctx.detail,
    userId: ctx.userId,
    projectId: ctx.projectId,
  };
  return JSON.stringify(payload).slice(0, 12_000);
}

async function callGeminiDiagnosis(ctx: GafcoreErrorContext): Promise<{
  diagnosis: SystemicDiagnosis;
  parsed: boolean;
  model: string;
}> {
  if (!tryGetGafcoreAiGateway()) {
    return {
      diagnosis: fallbackDiagnosis(ctx, "IA no configurada en el servidor (sin proveedor de chat)."),
      parsed: false,
      model: SYSTEMIC_DIAGNOSIS_MODEL,
    };
  }

  const userPayload = JSON.stringify(
    {
      component: ctx.component,
      route: ctx.route,
      method: ctx.method,
      httpStatus: ctx.status,
      errorCode: ctx.errorCode,
      message: ctx.message,
      stack: ctx.stack,
      detail: ctx.detail,
      userId: ctx.userId,
      projectId: ctx.projectId,
    },
    null,
    2,
  ).slice(0, 10_000);

  try {
    const { content } = await completeChatMessage({
      model: SYSTEMIC_DIAGNOSIS_MODEL,
      messages: [
        { role: "system", content: SYSTEMIC_DIAGNOSIS_SYSTEM },
        {
          role: "user",
          content: `Diagnostica este fallo de GafCore:\n\`\`\`json\n${userPayload}\n\`\`\``,
        },
      ],
      temperature: 0.2,
      json: true,
    });

    const loose = parseJsonLoose<unknown>(content);
    const validated = systemicDiagnosisSchema.safeParse(loose);
    if (validated.success) {
      return { diagnosis: validated.data, parsed: true, model: SYSTEMIC_DIAGNOSIS_MODEL };
    }

    const normalized = normalizeSystemicDiagnosisLoose(loose);
    if (normalized) {
      return { diagnosis: normalized, parsed: true, model: SYSTEMIC_DIAGNOSIS_MODEL };
    }

    return {
      diagnosis: fallbackDiagnosis(
        ctx,
        `La IA devolvió JSON inválido o incompleto: ${validated.error.message.slice(0, 200)}`,
      ),
      parsed: false,
      model: SYSTEMIC_DIAGNOSIS_MODEL,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "upstream_diagnosis_failed";
    return {
      diagnosis: fallbackDiagnosis(ctx, `Fallo al consultar Gemini: ${msg}`),
      parsed: false,
      model: SYSTEMIC_DIAGNOSIS_MODEL,
    };
  }
}

async function persistHealthLog(input: {
  componente: string;
  errorOriginal: string;
  diagnostico: SystemicDiagnosis;
  estado: GafcoreHealthLogEstado;
}): Promise<string | undefined> {
  const row = {
    componente: input.componente,
    error_original: input.errorOriginal,
    diagnostico_ia: input.diagnostico as unknown as Record<string, unknown>,
    estado: input.estado,
  };

  // Tabla: supabase/migrations/create_health_logs.sql (regenerar types.ts tras aplicar migración)
  const { data, error } = await (
    supabaseAdmin as unknown as {
      from: (t: string) => {
        insert: (r: typeof row) => {
          select: (c: string) => {
            maybeSingle: () => Promise<{
              data: { id: string } | null;
              error: { message: string; code?: string } | null;
            }>;
          };
        };
      };
    }
  )
    .from("gafcore_health_logs")
    .insert(row)
    .select("id")
    .maybeSingle();

  if (error) {
    console.warn(
      JSON.stringify({
        event: "gafcore_health_log_insert_failed",
        message: error.message,
        code: error.code,
      }),
    );
    return undefined;
  }

  return typeof data?.id === "string" ? data.id : undefined;
}

function resolveLogEstado(diagnosis: SystemicDiagnosis): GafcoreHealthLogEstado {
  if (
    diagnosis.success &&
    hasUsableActionableFix(diagnosis.actionableFix) &&
    diagnosis.errorType !== "usuario"
  ) {
    return "auto_reparado";
  }
  return "fallido";
}

/**
 * Diagnostica un fallo con Gemini Flash y persiste en `gafcore_health_logs`.
 * No modifica la lógica de negocio del caller.
 */
export async function diagnoseAndRepair(errorContext: unknown): Promise<SystemicDiagnosisResult> {
  const ctx = normalizeErrorContext(errorContext);
  const { diagnosis, parsed, model } = await callGeminiDiagnosis(ctx);
  const estado = resolveLogEstado(diagnosis);
  const logId = await persistHealthLog({
    componente: ctx.component,
    errorOriginal: serializeOriginalError(ctx),
    diagnostico: diagnosis,
    estado,
  });

  return {
    ...diagnosis,
    parsed,
    model,
    logId,
  };
}

/** Ejecuta diagnóstico en segundo plano (no bloquea la respuesta HTTP). */
export function scheduleSystemicDiagnosis(errorContext: unknown): void {
  void diagnoseAndRepair(errorContext).catch((e) => {
    console.warn(
      JSON.stringify({
        event: "gafcore_systemic_diagnosis_background_failed",
        message: e instanceof Error ? e.message : String(e),
      }),
    );
  });
}
