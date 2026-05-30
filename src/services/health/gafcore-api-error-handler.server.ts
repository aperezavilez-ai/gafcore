/**
 * Interceptor modular para rutas API GafCore (TanStack Start).
 * Captura errores 5xx y excepciones; envía contexto a diagnoseAndRepair en segundo plano.
 */
import { scheduleSystemicDiagnosis } from "@/services/health/gafcoreSystemic.server";
import type { GafcoreErrorContext } from "@/services/health/gafcoreSystemic.types.shared";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

export type GafcoreApiDiagnosticsMeta = {
  component: string;
};

function buildContext(
  meta: GafcoreApiDiagnosticsMeta,
  request: Request,
  extra: Partial<GafcoreErrorContext>,
): GafcoreErrorContext {
  const url = new URL(request.url);
  return {
    component: meta.component,
    route: url.pathname,
    method: request.method,
    ...extra,
  };
}

async function readResponseSnippet(response: Response): Promise<string | undefined> {
  try {
    const clone = response.clone();
    const text = await clone.text();
    return text.slice(0, 2000);
  } catch {
    return undefined;
  }
}

function internalErrorResponse(): Response {
  return new Response(
    JSON.stringify({
      error: "internal_error",
      detail: "Error interno en GafCore. El equipo ha registrado el incidente.",
    }),
    { status: 500, headers: JSON_HEADERS },
  );
}

/**
 * Envuelve handlers POST/GET de `/api/gafcore/*` sin alterar respuestas 2xx/4xx exitosas.
 */
export function withGafcoreApiDiagnostics(
  handler: (request: Request) => Promise<Response>,
  meta: GafcoreApiDiagnosticsMeta,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    try {
      const response = await handler(request);
      if (response.status >= 500) {
        const snippet = await readResponseSnippet(response);
        scheduleSystemicDiagnosis(
          buildContext(meta, request, {
            status: response.status,
            message: snippet,
            detail: { responseSnippet: snippet },
          }),
        );
      }
      return response;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      const status =
        err && typeof err === "object" && "status" in err && typeof (err as { status: unknown }).status === "number"
          ? (err as { status: number }).status
          : 500;
      const errorCode =
        err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string"
          ? (err as { code: string }).code
          : undefined;

      scheduleSystemicDiagnosis(
        buildContext(meta, request, {
          status,
          message,
          stack,
          errorCode,
        }),
      );

      return internalErrorResponse();
    }
  };
}
