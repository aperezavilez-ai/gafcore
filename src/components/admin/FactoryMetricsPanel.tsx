import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { getGafcoreFactoryAdminDashboard } from "@/lib/gafcore-factory-admin.functions";
import type { FactoryAdminDashboard } from "@/lib/gafcore-factory-admin.server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Factory, Loader2, RefreshCw } from "lucide-react";

function pctBadge(value: number | null): string {
  if (value === null) return "—";
  return `${value}%`;
}

export function FactoryMetricsPanel() {
  const load = useServerFn(getGafcoreFactoryAdminDashboard);
  const [dashboard, setDashboard] = useState<FactoryAdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await load({ data: { limit: 40 } });
      if (!res.ok) {
        toast.error("Sin permiso o error cargando métricas de fábrica.");
        setDashboard(null);
        return;
      }
      setDashboard(res.dashboard);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error cargando fábrica");
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/gafcore/app" aria-label="Volver al IDE">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Factory className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Métricas Modo Fábrica</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Actualizar
        </Button>
      </div>

      {loading && !dashboard ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : dashboard && dashboard.totalRuns === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Aún no hay runs de Modo Fábrica con métricas guardadas. Ejecuta un build con Fábrica ON en
            el IDE.
          </CardContent>
        </Card>
      ) : dashboard ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">Runs</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{dashboard.totalRuns}</p>
                <p className="text-xs text-muted-foreground">
                  Éxito global {pctBadge(dashboard.successRatePct)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  Validación media
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">
                  {dashboard.avgValidationScore ?? "—"}
                  {dashboard.avgValidationScore !== null ? (
                    <span className="text-sm font-normal text-muted-foreground">/100</span>
                  ) : null}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  Build smoke OK
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">
                  {pctBadge(dashboard.buildSmokeOkRatePct)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">
                  Deploy OK
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{pctBadge(dashboard.deployOkRatePct)}</p>
                <p className="text-xs text-muted-foreground">
                  {dashboard.deployAttempted} intentos
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Éxito por fase</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {dashboard.phaseAggregates.map((p) => (
                  <Badge key={p.phase} variant={p.ratePct >= 80 ? "default" : "secondary"}>
                    {p.phase}: {p.ok}/{p.total} ({p.ratePct}%)
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Últimos runs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {dashboard.recentRuns.map((r) => (
                <div
                  key={r.pipelineRunId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs"
                >
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {r.pipelineRunId.slice(0, 8)}…
                  </span>
                  <span>
                    {r.metrics.success ? (
                      <Badge variant="default">OK</Badge>
                    ) : (
                      <Badge variant="destructive">Fallo</Badge>
                    )}
                  </span>
                  <span className="text-muted-foreground">
                    score {r.metrics.validationScore ?? "—"} ·{" "}
                    {new Date(r.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
