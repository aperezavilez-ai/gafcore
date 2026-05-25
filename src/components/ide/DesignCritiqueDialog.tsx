/**
 * Auditor de diseño GafCore — Fase 4.
 *
 * Botón que pide al cerebro Claude Sonnet 4.5 una crítica visual del proyecto actual,
 * combina con heurísticas estáticas locales y permite aplicar las mejoras en el chat.
 */
import { useState, useCallback, type FC } from "react";
import { Sparkles, AlertTriangle, CircleAlert, Info, Loader2 } from "lucide-react";
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

export function DesignCritiqueDialog({ files, projectId }: Props) {
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

  const applyImprovements = useCallback(() => {
    if (!data?.followupInstruction) return;
    window.dispatchEvent(
      new CustomEvent("gafcore:apply-instruction", {
        detail: { instruction: data.followupInstruction },
      }),
    );
    setOpen(false);
  }, [data]);

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
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          title="Auditar el diseño actual con Claude Sonnet 4.5"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Auditar diseño
        </Button>
      </DialogTrigger>
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
            Analizando con Claude Sonnet 4.5…
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
            <Button onClick={applyImprovements} className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Aplicar mejoras en el chat
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
