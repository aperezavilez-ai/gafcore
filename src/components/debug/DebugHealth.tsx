import { useCallback, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Bug, PackageX, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runGafcoreHealthDebugDiagnosis } from "@/lib/gafcore-health-debug.functions";
import type { SystemicErrorType } from "@/services/health/gafcoreSystemic.types.shared";
import { logClientDebugGroup, logClientError } from "@/lib/gafcore-client-logger";

type DiagnosisPayload = {
  success: boolean;
  errorType: SystemicErrorType;
  rootCause: string;
  userFriendlyMessage: string;
  actionableFix: string | null;
  parsed: boolean;
  logId?: string;
  model?: string;
};

/**
 * QA — prueba de fuego del sistema inmunológico (gafcoreSystemic / diagnoseAndRepair).
 * Los resultados estructurados se imprimen en consola con Root Cause.
 */
export function DebugHealth() {
  const runDiagnosis = useServerFn(runGafcoreHealthDebugDiagnosis);
  const [loading, setLoading] = useState(false);
  const [last, setLast] = useState<DiagnosisPayload | null>(null);

  const logStructuredDiagnosis = useCallback((payload: DiagnosisPayload, scenario: string) => {
    logClientDebugGroup(`[GafCore Inmunológico] ${scenario}`, {
      success: payload.success,
      errorType: payload.errorType,
      rootCause: payload.rootCause,
      userFriendlyMessage: payload.userFriendlyMessage,
      actionableFix: payload.actionableFix,
      parsed: payload.parsed,
      ...(payload.logId ? { logId: payload.logId } : {}),
      ...(payload.model ? { model: payload.model } : {}),
    });
  }, []);

  const invokeDiagnosis = useCallback(
    async (scenario: "broken_import" | "logic_error" | "map_load_failure", err?: unknown) => {
      setLoading(true);
      try {
        const message =
          err instanceof Error
            ? err.message
            : scenario === "broken_import"
              ? "Cannot resolve module '@gafcore/non-existent-mobility-sdk'"
              : scenario === "map_load_failure"
                ? "Map tile provider timeout (mobility template)"
                : "Cannot read properties of undefined (reading 'coordinates')";

        const stack = err instanceof Error ? err.stack : undefined;

        const result = (await runDiagnosis({
          data: { scenario, message, stack },
        })) as DiagnosisPayload;

        setLast(result);
        logStructuredDiagnosis(result, scenario);
      } catch (e) {
        logClientError("[GafCore Inmunológico] fallo al invocar diagnoseAndRepair", e);
      } finally {
        setLoading(false);
      }
    },
    [runDiagnosis, logStructuredDiagnosis],
  );

  const simulateBrokenImport = async () => {
    const phantomModule = "@gafcore/non-existent-mobility-sdk";
    const err = new Error(`Cannot resolve module '${phantomModule}'`);
    err.name = "ModuleNotFoundError";
    (err as Error & { code?: string }).code = "ERR_MODULE_NOT_FOUND";
    await invokeDiagnosis("broken_import", err);
  };

  const simulateLogicError = async () => {
    let caught: unknown;
    try {
      const route: { coords?: { lat: number } } = {};
      void route.coords!.lat;
    } catch (err) {
      caught = err;
    }
    await invokeDiagnosis("logic_error", caught ?? new Error("Logic fault in route planner"));
  };

  const simulateMapFailure = () => invokeDiagnosis("map_load_failure");

  return (
    <div className="mx-auto max-w-2xl space-y-6 rounded-3xl border border-border/60 bg-card/80 p-8 shadow-xl backdrop-blur-sm">
      <div className="flex items-start gap-4">
        <div className="inline-flex size-12 items-center justify-center rounded-2xl bg-destructive/15 ring-1 ring-destructive/30">
          <Bug className="size-6 text-destructive" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Debug — Sistema inmunológico
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Dispara errores controlados y verifica la respuesta de{" "}
            <code className="rounded-md bg-muted px-1.5 py-0.5 text-xs">diagnoseAndRepair</code> en
            la consola del navegador (F12).
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button
          type="button"
          variant="outline"
          className="rounded-xl gap-2"
          disabled={loading}
          onClick={() => void simulateBrokenImport()}
        >
          <PackageX className="size-4" />
          Import inexistente
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-xl gap-2"
          disabled={loading}
          onClick={() => void simulateLogicError()}
        >
          <AlertTriangle className="size-4" />
          Error de lógica
        </Button>
        <Button
          type="button"
          className="rounded-xl gap-2"
          disabled={loading}
          onClick={() => void simulateMapFailure()}
        >
          <Play className="size-4" />
          Fallo de mapa (Mobilidad)
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground animate-pulse">
          Consultando agente de diagnóstico (Gemini Flash)…
        </p>
      ) : null}

      {last ? (
        <div className="space-y-3 rounded-2xl border border-border/50 bg-muted/20 p-5 text-sm">
          <p className="font-semibold text-foreground">Última respuesta (UI segura)</p>
          <dl className="grid gap-2">
            <div>
              <dt className="text-muted-foreground">errorType</dt>
              <dd className="font-mono text-foreground">{last.errorType}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">success</dt>
              <dd className="font-mono">{String(last.success)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Mensaje usuario</dt>
              <dd>{last.userFriendlyMessage}</dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            Root Cause completo → consola del navegador (grupo{" "}
            <span className="font-mono">[GafCore Inmunológico]</span>).
          </p>
        </div>
      ) : null}
    </div>
  );
}
