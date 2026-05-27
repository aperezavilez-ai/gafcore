import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  exportGafcoreFactoryRunsCsv,
  getGafcoreFactoryAdminDashboard,
} from "@/lib/gafcore-factory-admin.functions";
import { buildFactoryRunsCsv } from "@/lib/gafcore-factory-csv.shared";
import { listFactoryProfileSelectorOptions } from "@/lib/gafcore-factory-templates.shared";
import type { FactoryAdminDashboard } from "@/lib/gafcore-factory-admin.server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, ArrowLeft, Download, Factory, Loader2, RefreshCw } from "lucide-react";

function pctBadge(value: number | null): string {
  if (value === null) return "—";
  return `${value}%`;
}

const PROFILE_FILTER_OPTIONS = [
  { id: "all", label: "Todas las plantillas" },
  ...listFactoryProfileSelectorOptions()
    .filter((o) => o.id !== "auto")
    .map((o) => ({ id: o.id, label: o.label })),
];

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function FactoryMetricsPanel() {
  const load = useServerFn(getGafcoreFactoryAdminDashboard);
  const exportCsv = useServerFn(exportGafcoreFactoryRunsCsv);
  const [dashboard, setDashboard] = useState<FactoryAdminDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [profileFilter, setProfileFilter] = useState("all");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await load({
        data: {
          limit: 40,
          ...(profileFilter !== "all" ? { profileFilter } : {}),
        },
      });
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
  }, [load, profileFilter]);

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
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={profileFilter}
            onChange={(e) => setProfileFilter(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
            aria-label="Filtrar por plantilla"
          >
            {PROFILE_FILTER_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Actualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={exporting || !dashboard?.recentRuns.length}
            onClick={() => {
              if (!dashboard?.recentRuns.length) return;
              const stamp = new Date().toISOString().slice(0, 10);
              downloadCsv(
                `gafcore-factory-${stamp}.csv`,
                buildFactoryRunsCsv(dashboard.recentRuns),
              );
              toast.success(`CSV exportado (${dashboard.recentRuns.length} runs visibles)`);
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            CSV (vista)
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                const res = await exportCsv({ data: { limit: 200 } });
                if (!res.ok) {
                  toast.error("Sin permiso para exportar.");
                  return;
                }
                const stamp = new Date().toISOString().slice(0, 10);
                downloadCsv(`gafcore-factory-full-${stamp}.csv`, res.csv);
                toast.success(`CSV completo (${res.count} runs)`);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Error exportando");
              } finally {
                setExporting(false);
              }
            }}
          >
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            CSV (200)
          </Button>
        </div>
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
          {dashboard.globalAlert || dashboard.phaseAlerts.length > 0 ? (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  Alertas de calidad
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {dashboard.globalAlert ? (
                  <p className="text-foreground">{dashboard.globalAlert}</p>
                ) : null}
                {dashboard.phaseAlerts.map((a) => (
                  <p key={a.phase} className="text-muted-foreground">
                    <Badge variant="destructive" className="mr-2">
                      {a.phase} {a.ratePct}%
                    </Badge>
                    {a.message}
                  </p>
                ))}
              </CardContent>
            </Card>
          ) : null}

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

          {dashboard.profileBreakdown.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Por plantilla (sin filtrar)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {dashboard.profileBreakdown.map((p) => (
                    <div
                      key={p.profileId}
                      className="rounded-md border border-border/60 bg-muted/20 px-3 py-2"
                    >
                      <p className="text-xs font-medium text-foreground">{p.profileLabel}</p>
                      <p className="text-lg font-semibold tabular-nums">{p.total} runs</p>
                      <p className="text-[10px] text-muted-foreground">
                        Éxito {p.successRatePct}% ({p.successRuns}/{p.total})
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Éxito por fase</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {dashboard.phaseAggregates.map((p) => {
                  const alert = dashboard.phaseAlerts.some((a) => a.phase === p.phase);
                  return (
                    <Badge
                      key={p.phase}
                      variant={alert ? "destructive" : p.ratePct >= 80 ? "default" : "secondary"}
                    >
                      {p.phase}: {p.ok}/{p.total} ({p.ratePct}%)
                    </Badge>
                  );
                })}
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
                  <Badge variant="outline" className="text-[10px]">
                    {r.profileLabel}
                  </Badge>
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
