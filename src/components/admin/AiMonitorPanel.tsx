import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { runValidarIA } from "@/lib/gafcore-ai-monitor.functions";
import {
  AI_MONITOR_FAIL_ALERT_THRESHOLD,
  AI_MONITOR_LAST_VALIDATION_STORAGE_KEY,
  AI_MONITOR_SESSION_STORAGE_KEY,
  aiMonitorStatusTone,
  aiMonitorVisualEmoji,
  aiMonitorVisualLabel,
  formatAiMonitorValidatedAt,
  type AiMonitorLastValidation,
  type AiMonitorSession,
  type AiMonitorVisualStatus,
  type ValidarIAFullResult,
} from "@/lib/gafcore-ai-monitor.shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ArrowLeft, Brain, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

function readLastValidation(): AiMonitorLastValidation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AI_MONITOR_LAST_VALIDATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AiMonitorLastValidation;
    if (!parsed?.validatedAt || typeof parsed.errores !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLastValidation(result: ValidarIAFullResult): void {
  if (typeof window === "undefined") return;
  const payload: AiMonitorLastValidation = {
    validatedAt: result.validatedAt,
    estado: result.estado,
    errores: result.errores,
    visualStatus: result.visualStatus,
    advertencia: result.advertencia,
    mensaje: result.mensaje,
  };
  try {
    localStorage.setItem(AI_MONITOR_LAST_VALIDATION_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota */
  }
}

function readSession(): AiMonitorSession {
  if (typeof window === "undefined") return { failCount: 0, history: [] };
  try {
    const raw = localStorage.getItem(AI_MONITOR_SESSION_STORAGE_KEY);
    if (!raw) return { failCount: 0, history: [] };
    const parsed = JSON.parse(raw) as AiMonitorSession;
    return {
      failCount: typeof parsed.failCount === "number" ? parsed.failCount : 0,
      history: Array.isArray(parsed.history) ? parsed.history.slice(0, 8) : [],
    };
  } catch {
    return { failCount: 0, history: [] };
  }
}

function writeSession(session: AiMonitorSession): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(AI_MONITOR_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* quota */
  }
}

function bumpSession(result: ValidarIAFullResult): AiMonitorSession {
  const prev = readSession();
  const entry = {
    at: result.validatedAt,
    estado: result.estado,
    errores: result.errores,
  };
  const failCount = result.estado === "ERROR" ? prev.failCount + 1 : prev.failCount;
  const session: AiMonitorSession = {
    failCount,
    history: [entry, ...prev.history].slice(0, 8),
  };
  writeSession(session);
  return session;
}

const STATUS_PANEL_CLASS: Record<ReturnType<typeof aiMonitorStatusTone>, string> = {
  ok: "border-primary/40 bg-primary/10 text-foreground",
  warn: "border-warning/50 bg-warning/15 text-foreground",
  error: "border-destructive/50 bg-destructive/10 text-foreground",
};

export function AiMonitorPanel() {
  const validar = useServerFn(runValidarIA);

  const [lastValidation, setLastValidation] = useState<AiMonitorLastValidation | null>(null);
  const [result, setResult] = useState<ValidarIAFullResult | null>(null);
  const [session, setSession] = useState<AiMonitorSession>({ failCount: 0, history: [] });
  const [validating, setValidating] = useState(false);

  const displayStatus: AiMonitorVisualStatus =
    result?.visualStatus ?? lastValidation?.visualStatus ?? "risk";

  const tone = aiMonitorStatusTone(displayStatus);

  useEffect(() => {
    setLastValidation(readLastValidation());
    setSession(readSession());
  }, []);

  const onValidate = useCallback(async () => {
    setValidating(true);
    setResult(null);
    try {
      const res = await validar();
      setResult(res);
      writeLastValidation(res);
      setLastValidation(readLastValidation());
      setSession(bumpSession(res));
      if (res.estado === "OK") {
        toast.success(res.mensaje);
      } else {
        toast.error(res.mensaje);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error en validación");
    } finally {
      setValidating(false);
    }
  }, [validar]);

  const estadoActual = result?.estado ?? lastValidation?.estado;
  const errores = result?.errores ?? lastValidation?.errores;
  const mensaje =
    result?.mensaje ?? lastValidation?.mensaje ?? "Pulsa «Validar IA» tras cambios en prompts o generación.";
  const lastAt = result?.validatedAt ?? lastValidation?.validatedAt;

  const showFrequentFailAlert = session.failCount >= AI_MONITOR_FAIL_ALERT_THRESHOLD;

  return (
    <section className="border-b border-border bg-muted/20">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/gafcore/app">
                <ArrowLeft className="mr-1 h-4 w-4" />
                IDE
              </Link>
            </Button>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Detector de código IA</h2>
              <p className="text-sm text-muted-foreground">
                Comprueba si el código generado rompe la app — no el estado de OpenAI/Claude.
              </p>
            </div>
          </div>
          <Button type="button" onClick={() => void onValidate()} disabled={validating}>
            {validating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Validar IA
          </Button>
        </div>

        {showFrequentFailAlert ? (
          <div className="mb-4 flex gap-2 rounded-lg border border-warning/50 bg-warning/15 p-3 text-sm text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p>
              La IA está rompiendo código con frecuencia ({session.failCount} fallos en esta
              sesión). Revisa prompts o reglas antes de publicar.
            </p>
          </div>
        ) : null}

        <div
          className={cn(
            "mb-4 rounded-xl border-2 p-5 transition-colors",
            STATUS_PANEL_CLASS[tone],
          )}
        >
          <p className="text-sm font-medium text-muted-foreground">Estado actual</p>
          <p className="mt-1 text-2xl font-semibold">
            {aiMonitorVisualEmoji(displayStatus)}{" "}
            {estadoActual ?? "Sin validar"}
            {estadoActual ? ` · ${aiMonitorVisualLabel(displayStatus)}` : ""}
          </p>
          <p className="mt-2 text-sm">
            Errores detectados:{" "}
            <span className="font-semibold">{errores ?? "—"}</span>
          </p>
          <p className="mt-2 text-sm opacity-90">{mensaje}</p>
          {lastAt ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Última validación: {formatAiMonitorValidatedAt(lastAt)}
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Brain className="h-5 w-5 text-primary" />
                Guía rápida
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                <span className="text-primary">🟢 OK</span> → sigue trabajando / puedes publicar
              </p>
              <p>
                <span className="text-warning">🟡 Advertencia</span> → revisa antes de publicar
              </p>
              <p>
                <span className="text-destructive">🔴 ERROR</span> → no publiques
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Sesión</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Fallos en sesión: </span>
                <span className="font-medium text-foreground">{session.failCount}</span>
              </p>
              {session.history.length > 0 ? (
                <ul className="space-y-1 text-muted-foreground">
                  {session.history.slice(0, 5).map((h) => (
                    <li key={h.at}>
                      {formatAiMonitorValidatedAt(h.at)} — {h.estado} ({h.errores}{" "}
                      {h.errores === 1 ? "error" : "errores"})
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">Sin historial en esta sesión.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {result && result.checks.length > 0 ? (
          <Card className="mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Detalle validarIA()</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {result.checks.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border px-3 py-2"
                  >
                    <span className="font-medium text-foreground">{c.name}</span>
                    <Badge variant={c.ok ? "secondary" : "destructive"}>
                      {c.ok ? "OK" : "ERROR"}
                    </Badge>
                    <span className="w-full text-muted-foreground">{c.detail}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </section>
  );
}
