import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  runDiagnosticsScan,
  listDiagnosticReports,
  getDiagnosticReportDetail,
  analyzeReportWithAi,
  decideDiagnosticReport,
  executeDiagnosticFix,
  ingestDiagnosticReport,
} from "@/lib/server-fns/diagnostics.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  severityLabel,
  statusLabel,
  formatDiagnosticScanTime,
  DIAGNOSTIC_LAST_SCAN_STORAGE_KEY,
  type DiagnosticLastScan,
  type DiagnosticReportRow,
  type DiagnosticSeverity,
} from "@/lib/gafcore-diagnostics.shared";
import { ArrowLeft, CheckCircle2, Loader2, Package, RefreshCw, ShieldAlert } from "lucide-react";

function readLastScanFromStorage(): DiagnosticLastScan | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DIAGNOSTIC_LAST_SCAN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DiagnosticLastScan;
    if (!parsed?.scannedAt || typeof parsed.ok !== "boolean") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLastScanToStorage(scan: DiagnosticLastScan): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DIAGNOSTIC_LAST_SCAN_STORAGE_KEY, JSON.stringify(scan));
  } catch {
    /* quota / private mode */
  }
}

function severityVariant(s: DiagnosticSeverity): "default" | "secondary" | "destructive" | "outline" {
  if (s === "critical" || s === "high") return "destructive";
  if (s === "medium") return "secondary";
  return "outline";
}

export function DiagnosticsOpsPanel() {
  const scan = useServerFn(runDiagnosticsScan);
  const list = useServerFn(listDiagnosticReports);
  const detail = useServerFn(getDiagnosticReportDetail);
  const analyze = useServerFn(analyzeReportWithAi);
  const decide = useServerFn(decideDiagnosticReport);
  const execute = useServerFn(executeDiagnosticFix);
  const ingest = useServerFn(ingestDiagnosticReport);

  const [reports, setReports] = useState<DiagnosticReportRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<DiagnosticReportRow | null>(null);
  const [audit, setAudit] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [modifyText, setModifyText] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualDesc, setManualDesc] = useState("");
  const [lastScan, setLastScan] = useState<DiagnosticLastScan | null>(null);

  const reloadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await list({ data: { limit: 50 } });
      setReports(res.reports);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error cargando reportes");
    } finally {
      setLoading(false);
    }
  }, [list]);

  const loadDetail = useCallback(
    async (id: string) => {
      setSelectedId(id);
      try {
        const res = await detail({ data: { id } });
        setSelected(res.report);
        setModifyText(res.report.modified_fix ?? res.report.proposed_fix ?? "");
        setAudit(res.audit as Array<Record<string, unknown>>);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error cargando detalle");
      }
    },
    [detail],
  );

  useEffect(() => {
    void reloadList();
    setLastScan(readLastScanFromStorage());
  }, [reloadList]);

  const onScan = async () => {
    setBusy(true);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : undefined;
      const res = await scan({ data: { origin, environment: "production" } });
      const summary: DiagnosticLastScan = {
        scannedAt: res.scanned_at,
        ok: res.ok,
        created: res.created,
        environment: res.environment,
      };
      setLastScan(summary);
      writeLastScanToStorage(summary);
      toast.success(
        res.ok ? "Escaneo OK: sin hallazgos" : `Escaneo: ${res.created} reporte(s) creado(s)`,
      );
      await reloadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error en escaneo");
    } finally {
      setBusy(false);
    }
  };

  const onAnalyze = async () => {
    if (!selectedId) return;
    setBusy(true);
    try {
      await analyze({ data: { id: selectedId } });
      toast.success("Análisis IA listo");
      await loadDetail(selectedId);
      await reloadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error en análisis IA");
    } finally {
      setBusy(false);
    }
  };

  const onDecision = async (decision: "approve" | "reject" | "defer" | "modify") => {
    if (!selectedId) return;
    setBusy(true);
    try {
      await decide({
        data: {
          id: selectedId,
          decision,
          modified_fix: decision === "modify" ? modifyText : undefined,
        },
      });
      toast.success(`Decisión: ${decision}`);
      await loadDetail(selectedId);
      await reloadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error guardando decisión");
    } finally {
      setBusy(false);
    }
  };

  const onExecute = async () => {
    if (!selectedId) return;
    setBusy(true);
    try {
      const res = await execute({ data: { id: selectedId } });
      toast.success("Fix ejecutado (sandbox + trazabilidad)");
      console.info("[diagnostics execute]", res);
      await loadDetail(selectedId);
      await reloadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error ejecutando fix");
    } finally {
      setBusy(false);
    }
  };

  const onManualIngest = async () => {
    if (!manualTitle.trim() || !manualDesc.trim()) {
      toast.error("Título y descripción requeridos");
      return;
    }
    setBusy(true);
    try {
      const res = await ingest({
        data: {
          module: "manual",
          title: manualTitle.trim(),
          description: manualDesc.trim(),
          severity: "medium",
          source: "manual",
        },
      });
      toast.success("Reporte manual creado");
      setManualTitle("");
      setManualDesc("");
      await reloadList();
      if (res.id) await loadDetail(res.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error creando reporte");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 pb-16 md:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/gafcore/app">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Volver al IDE
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/gafcore/admin/marketplace">
            <Package className="mr-2 h-4 w-4" />
            Publisher marketplace
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">Ops — Diagnóstico y aprobación</h1>
        </div>
        <Badge variant="outline">Solo administrador</Badge>
      </div>

      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle className="text-base">Acciones</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={() => void onScan()} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Escanear sistema (doctor + health)
          </Button>
          <Button variant="secondary" onClick={() => void reloadList()} disabled={busy}>
            Actualizar lista
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle className="text-base">Reportes</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[480px] space-y-2 overflow-y-auto">
            {lastScan && (
              <div
                className={`rounded-lg border px-3 py-2.5 text-sm ${
                  lastScan.ok
                    ? "border-primary/30 bg-primary/5 text-foreground"
                    : "border-destructive/30 bg-destructive/5 text-foreground"
                }`}
              >
                <div className="flex items-start gap-2">
                  {lastScan.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium">
                      {lastScan.ok
                        ? "Último escaneo: OK, sin hallazgos"
                        : `Último escaneo: ${lastScan.created} reporte(s) detectado(s)`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDiagnosticScanTime(lastScan.scannedAt)} · {lastScan.environment}
                    </p>
                    {lastScan.ok && reports.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Los escaneos limpios no crean filas; solo aparecen aquí los problemas o
                        reportes manuales.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
            {loading && <p className="text-sm text-muted-foreground">Cargando…</p>}
            {!loading && reports.length === 0 && !lastScan && (
              <p className="text-sm text-muted-foreground">
                Sin reportes. Pulsa «Escanear sistema» para comprobar doctor + health.
              </p>
            )}
            {!loading && reports.length === 0 && lastScan && !lastScan.ok && (
              <p className="text-sm text-muted-foreground">
                No hay reportes en la lista. Si acabas de escanear, pulsa «Actualizar lista».
              </p>
            )}
            {reports.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => void loadDetail(r.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  selectedId === r.id ? "border-primary bg-primary/10" : "border-border/60 hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="line-clamp-1 font-medium text-foreground">{r.title}</span>
                  <Badge variant={severityVariant(r.severity)}>{severityLabel(r.severity)}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.module} · {statusLabel(r.status)}
                </p>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/40">
          <CardHeader>
            <CardTitle className="text-base">Detalle y aprobación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selected && (
              <p className="text-sm text-muted-foreground">Selecciona un reporte de la lista.</p>
            )}
            {selected && (
              <>
                <div>
                  <p className="font-semibold text-foreground">{selected.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{selected.description}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {selected.module} · {statusLabel(selected.status)} · {selected.source}
                  </p>
                </div>

                {selected.analysis_json && (
                  <div className="space-y-2 rounded-lg border border-border/60 bg-background/40 p-3 text-sm">
                    <p className="font-medium text-foreground">Análisis IA</p>
                    <p className="whitespace-pre-wrap text-muted-foreground">
                      {(selected.analysis_json as { root_cause_analysis?: string }).root_cause_analysis}
                    </p>
                    <p className="whitespace-pre-wrap text-muted-foreground">
                      <span className="font-medium text-foreground">Fix sugerido: </span>
                      {selected.proposed_fix}
                    </p>
                    {selected.fix_type && (
                      <p className="text-xs text-muted-foreground">Acción: {selected.fix_type}</p>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => void onAnalyze()} disabled={busy}>
                    Analizar con IA
                  </Button>
                  <Button size="sm" onClick={() => void onDecision("approve")} disabled={busy}>
                    Aprobar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void onDecision("reject")} disabled={busy}>
                    Rechazar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => void onDecision("defer")} disabled={busy}>
                    Posponer
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>Modificar plan (MODIFY)</Label>
                  <Textarea value={modifyText} onChange={(e) => setModifyText(e.target.value)} rows={4} />
                  <Button size="sm" variant="secondary" onClick={() => void onDecision("modify")} disabled={busy}>
                    Guardar modificación
                  </Button>
                </div>

                {(selected.admin_decision === "approve" || selected.admin_decision === "modify") && (
                  <Button onClick={() => void onExecute()} disabled={busy} className="w-full">
                    Ejecutar fix aprobado (sandbox)
                  </Button>
                )}

                {audit.length > 0 && (
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border/60 p-3 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">Auditoría</p>
                    {audit.map((a) => (
                      <p key={String(a.id)}>
                        {String(a.created_at)} — {String(a.event_type)}: {String(a.message)}
                      </p>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 bg-card/40">
        <CardHeader>
          <CardTitle className="text-base">Ingesta manual (observabilidad)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Título del incidente" value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} />
          <Textarea placeholder="Descripción" value={manualDesc} onChange={(e) => setManualDesc(e.target.value)} />
          <Button variant="secondary" onClick={() => void onManualIngest()} disabled={busy}>
            Crear reporte manual
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
