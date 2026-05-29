import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listGafcoreAuditEvents,
  listGafcoreSystemControls,
  updateGafcoreSystemControl,
  exportGafcoreAuditCsv,
} from "@/lib/gafcore-governance.functions";
import {
  auditOutcomeLabel,
  systemControlLabel,
  type GafcoreAuditEventRow,
  type GafcoreSystemControlKey,
  type GafcoreSystemControlRow,
} from "@/lib/gafcore-governance.shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, Shield, ShieldAlert, Download } from "lucide-react";

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-ES", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function riskBadgeVariant(level: string | null): "default" | "secondary" | "destructive" | "outline" {
  if (level === "critical" || level === "high") return "destructive";
  if (level === "medium") return "secondary";
  return "outline";
}

export function GovernanceOpsPanel() {
  const listControls = useServerFn(listGafcoreSystemControls);
  const updateControl = useServerFn(updateGafcoreSystemControl);
  const listAudit = useServerFn(listGafcoreAuditEvents);
  const exportCsv = useServerFn(exportGafcoreAuditCsv);

  const [controls, setControls] = useState<GafcoreSystemControlRow[]>([]);
  const [audit, setAudit] = useState<GafcoreAuditEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [messages, setMessages] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [ctrlRes, auditRes] = await Promise.all([
        listControls(),
        listAudit({ data: { limit: 40 } }),
      ]);
      setControls(ctrlRes.controls as GafcoreSystemControlRow[]);
      setAudit(auditRes.events as GafcoreAuditEventRow[]);
      const msgMap: Record<string, string> = {};
      for (const c of ctrlRes.controls as GafcoreSystemControlRow[]) {
        if (c.message) msgMap[c.key] = c.message;
      }
      setMessages(msgMap);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error cargando gobernanza");
    } finally {
      setLoading(false);
    }
  }, [listControls, listAudit]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggleControl = async (key: GafcoreSystemControlKey, enabled: boolean) => {
    setBusyKey(key);
    try {
      await updateControl({
        data: {
          key,
          enabled,
          message: messages[key]?.trim() || null,
        },
      });
      toast.success(`${systemControlLabel(key)} ${enabled ? "activado" : "desactivado"}`);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar");
    } finally {
      setBusyKey(null);
    }
  };

  const saveMessage = async (key: GafcoreSystemControlKey) => {
    const row = controls.find((c) => c.key === key);
    if (!row) return;
    setBusyKey(`${key}-msg`);
    try {
      await updateControl({
        data: {
          key,
          enabled: row.enabled,
          message: messages[key]?.trim() || null,
        },
      });
      toast.success("Mensaje guardado");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error guardando mensaje");
    } finally {
      setBusyKey(null);
    }
  };

  const downloadAuditCsv = async () => {
    setExportBusy(true);
    try {
      const res = await exportCsv({ data: { limit: 5000 } });
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV descargado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error exportando CSV");
    } finally {
      setExportBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Cargando gobernanza…
      </div>
    );
  }

  const maintenanceOn = controls.find((c) => c.key === "maintenance_mode")?.enabled;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
            <Shield className="h-5 w-5 text-primary" />
            Gobernanza y control
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Kill switches, permisos IA y auditoría. No afecta usuarios si todo está activo.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void reload()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Actualizar
        </Button>
      </div>

      {maintenanceOn ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          Modo mantenimiento activo — usuarios no admin no pueden usar IA.
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Kill switches</CardTitle>
          <CardDescription>
            Desactiva subsistemas sin redeploy. Los admins siguen operando con IA.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {controls.map((ctrl) => (
            <div
              key={ctrl.key}
              className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-1">
                <Label htmlFor={`ctrl-${ctrl.key}`} className="font-medium">
                  {systemControlLabel(ctrl.key)}
                </Label>
                <p className="text-xs text-muted-foreground font-mono">{ctrl.key}</p>
              </div>
              <div className="flex flex-col gap-2 sm:items-end">
                <div className="flex items-center gap-2">
                  {busyKey === ctrl.key ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : null}
                  <Switch
                    id={`ctrl-${ctrl.key}`}
                    checked={ctrl.enabled}
                    disabled={busyKey === ctrl.key}
                    onCheckedChange={(v) => void toggleControl(ctrl.key, v)}
                  />
                </div>
                {(ctrl.key === "maintenance_mode" ||
                  ctrl.key === "ai_enabled" ||
                  ctrl.key === "chat_enabled") && (
                  <div className="flex w-full max-w-md gap-2">
                    <Input
                      placeholder="Mensaje al usuario (opcional)"
                      value={messages[ctrl.key] ?? ""}
                      onChange={(e) =>
                        setMessages((m) => ({ ...m, [ctrl.key]: e.target.value }))
                      }
                      className="text-sm"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busyKey === `${ctrl.key}-msg`}
                      onClick={() => void saveMessage(ctrl.key)}
                    >
                      Guardar
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Auditoría reciente</CardTitle>
            <CardDescription>Acciones IA, bloqueos y cambios de control.</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={exportBusy}
            onClick={() => void downloadAuditCsv()}
          >
            {exportBusy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Exportar CSV
          </Button>
        </CardHeader>
        <CardContent>
          {audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin eventos aún.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Hora</th>
                    <th className="pb-2 pr-4 font-medium">Acción</th>
                    <th className="pb-2 pr-4 font-medium">Resultado</th>
                    <th className="pb-2 pr-4 font-medium">Riesgo</th>
                    <th className="pb-2 font-medium">Recurso</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((ev) => (
                    <tr key={ev.id} className="border-b border-border/60">
                      <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                        {formatTime(ev.created_at)}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">{ev.action}</td>
                      <td className="py-2 pr-4">
                        <Badge
                          variant={
                            ev.outcome === "blocked" ? "destructive" : "secondary"
                          }
                        >
                          {auditOutcomeLabel(ev.outcome)}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4">
                        {ev.risk_level ? (
                          <Badge variant={riskBadgeVariant(ev.risk_level)}>
                            {ev.risk_level} ({ev.risk_score ?? "—"})
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 font-mono text-xs text-muted-foreground">
                        {ev.resource_type ?? "—"}
                        {ev.resource_id ? ` / ${ev.resource_id.slice(0, 8)}…` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
