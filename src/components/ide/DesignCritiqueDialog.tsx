/**
 * Auditor de diseño GafCore — Fase 4.
 *
 * Botón que pide al cerebro Claude Sonnet 4.5 una crítica visual del proyecto actual,
 * combina con heurísticas estáticas locales y permite aplicar las mejoras en el chat.
 */
import { useState, useCallback, type FC } from "react";
import { Sparkles, AlertTriangle, CircleAlert, Info, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getAuthAccessToken } from "@/hooks/useAuth";
import type {
  DesignCritiqueResponse,
  DesignIssue,
  DesignIssueSeverity,
} from "@/lib/gafcore-design-critique.shared";
import type { FileItem } from "@/components/ide/CodeEditor";

type Props = {
  files: FileItem[];
  projectId: string | null;
  /** Cierra la vista previa y vuelve al chat (panel workspace). */
  onClose?: () => void;
};

const severityIcon: Record<DesignIssueSeverity, FC<{ className?: string }>> = {
  info: Info,
  warning: CircleAlert,
  blocker: AlertTriangle,
};

const severityColor: Record<DesignIssueSeverity, string> = {
  info: "text-blue-600 dark:text-blue-400",
  warning: "text-amber-600 dark:text-amber-400",
  blocker: "text-destructive",
};

export function DesignCritiqueDialog({ files, projectId, onClose }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DesignCritiqueResponse | null>(null);

  const runCritique = useCallback(async () => {
    setLoading(true);
    setData(null);
    try {
      const token = await getAuthAccessToken();
      if (!token) {
        toast.error("Inicia sesión para auditar el diseño.");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/gafcore/design-critique", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          projectId: projectId ?? undefined,
          files: files.map((f) => ({ name: f.name, content: f.content })),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json?.ok) {
        if (json?.error === "insufficient_credits") {
          toast.error("Sin créditos suficientes para auditar.");
        } else if (json?.error === "rate_limited") {
          toast.error("Demasiadas peticiones, intenta en un momento.");
        } else {
          toast.error("No se pudo completar la auditoría.");
        }
        setLoading(false);
        return;
      }

      setData(json.critique as DesignCritiqueResponse);
    } catch (e) {
      console.error("[critique] failed:", e);
      toast.error("Error al auditar el diseño.");
    } finally {
      setLoading(false);
    }
  }, [files, projectId]);

  const applyImprovements = useCallback(
    (autoSend = false) => {
      if (!data?.followupInstruction) return;
      window.dispatchEvent(
        new CustomEvent("gafcore:apply-instruction", {
          detail: { instruction: data.followupInstruction, autoSend },
        }),
      );
      setOpen(false);
    },
    [data],
  );

  const auditAndAutoApply = useCallback(async () => {
    setLoading(true);
    setData(null);
    try {
      const token = await getAuthAccessToken();
      if (!token) {
        toast.error("Inicia sesión para auditar el diseño.");
        setLoading(false);
        return;
      }
      const res = await fetch("/api/gafcore/design-critique", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          projectId: projectId ?? undefined,
          files: files.map((f) => ({ name: f.name, content: f.content })),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        toast.error("No se pudo completar la auditoría.");
        setLoading(false);
        return;
      }
      const critique = json.critique as DesignCritiqueResponse;
      setData(critique);
      if (critique.issues.length === 0) {
        toast.success("Sin issues — diseño OK.");
        setLoading(false);
        return;
      }
      window.dispatchEvent(
        new CustomEvent("gafcore:apply-instruction", {
          detail: { instruction: critique.followupInstruction, autoSend: true },
        }),
      );
      toast.success(`Auditoría OK (${critique.issues.length} mejoras) — aplicando…`);
      setOpen(false);
    } catch (e) {
      console.error("[critique-auto]", e);
      toast.error("Error al auditar.");
    } finally {
      setLoading(false);
    }
  }, [files, projectId]);

  const grouped: Record<DesignIssueSeverity, DesignIssue[]> = {
    blocker: [],
    warning: [],
    info: [],
  };
  for (const i of data?.issues ?? []) grouped[i.severity].push(i);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && !data && !loading) void runCritique();
      }}
    >
      <div className="flex items-center gap-2">
        <Button
          variant="default"
          size="sm"
          className="gap-1.5"
          onClick={auditAndAutoApply}
          disabled={loading}
          title="Audita el diseño y aplica las mejoras automáticamente en el chat"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          Auditar y mejorar
        </Button>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            title="Ver detalles antes de aplicar"
          >
            Ver detalles
          </Button>
        </DialogTrigger>
        {onClose ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={onClose}
            title="Cerrar vista previa"
            aria-label="Cerrar vista previa"
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Auditor de diseño GafCore
          </DialogTitle>
          <DialogDescription>
            El cerebro analiza tu proyecto y propone mejoras concretas que puedes aplicar en el chat.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analizando tu diseño con el cerebro de GafCore…
          </div>
        )}

        {data && !loading && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm">{data.summary}</p>
                <Badge variant={data.score >= 80 ? "default" : data.score >= 60 ? "secondary" : "destructive"}>
                  {data.score}/100
                </Badge>
              </div>
            </div>

            {(["blocker", "warning", "info"] as DesignIssueSeverity[]).map((sev) =>
              grouped[sev].length === 0 ? null : (
                <div key={sev} className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {sev === "blocker"
                      ? `Bloqueantes (${grouped[sev].length})`
                      : sev === "warning"
                        ? `Advertencias (${grouped[sev].length})`
                        : `Sugerencias (${grouped[sev].length})`}
                  </h3>
                  <ul className="space-y-2">
                    {grouped[sev].map((issue) => {
                      const Icon = severityIcon[issue.severity];
                      return (
                        <li
                          key={issue.id}
                          className="rounded-md border border-border bg-background p-3 text-sm"
                        >
                          <div className="flex items-start gap-2">
                            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${severityColor[issue.severity]}`} />
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{issue.title}</span>
                                <Badge variant="outline" className="text-[10px] uppercase">
                                  {issue.category}
                                </Badge>
                                {issue.file && (
                                  <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                    {issue.file}
                                  </code>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">{issue.detail}</p>
                              <p className="text-xs">
                                <span className="font-medium">Sugerencia:</span> {issue.suggestion}
                              </p>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ),
            )}

            {data.issues.length === 0 && (
              <div className="rounded-md border border-border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                Sin issues reseñables. Tu diseño respeta el sistema GafCore.
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {data && (
            <Button onClick={runCritique} variant="outline" size="sm" disabled={loading}>
              Reauditar
            </Button>
          )}
          {data && data.issues.length > 0 && (
            <>
              <Button onClick={() => applyImprovements(false)} variant="outline" className="gap-1.5">
                Solo añadir al chat
              </Button>
              <Button onClick={() => applyImprovements(true)} className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                Aplicar mejoras ya
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
