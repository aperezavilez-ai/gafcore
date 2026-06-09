import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Globe,
  Copy,
  Check,
  ExternalLink,
  Settings as SettingsIcon,
  Loader2,
  Github,
  Shield,
  Pencil,
  Activity,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  listPublishes,
  recordPublish,
  updatePublishRecord,
  type PublishRow,
} from "@/lib/userSupabase";
import { requestGafcoreCriticalApproval } from "@/lib/gafcore-governance.functions";
import { CriticalActionConfirmDialog } from "@/components/ide/CriticalActionConfirmDialog";
import type { GafcoreRiskAssessment } from "@/lib/gafcore-governance.shared";
import type { GafcoreDeployResult, ProjectDeployStatus } from "@/lib/gafcore-deploy.shared";
import { isBlockedDeployHost, normalizeDeployHost } from "@/lib/gafcore-deploy.shared";
import { getProjectDeployStatus, verifyDeploySite } from "@/lib/gafcore-deploy.functions";

type CheckStatus = "idle" | "running" | "ok" | "fail";

type Visibility = "public" | "private";

type Props = {
  children: React.ReactNode;
  siteHost?: string | null;
  githubRepo?: string | null;
  projectId?: string | null;
  projectName?: string;
  hasProject?: boolean;
  githubConfigured?: boolean;
  isUpdating?: boolean;
  onUpdate?: (opts?: { approvalId?: string }) => Promise<GafcoreDeployResult>;
  onOpenSettings?: () => void;
  onOpenChange?: (open: boolean) => void;
};

/** Modal de publicación — layout tipo Lovable (panel claro, CTA “Al día”). */
export function PublishDialog({
  children,
  siteHost,
  githubRepo,
  projectId,
  projectName = "Proyecto",
  hasProject = true,
  githubConfigured = false,
  isUpdating = false,
  onUpdate,
  onOpenSettings,
  onOpenChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [visibility] = useState<Visibility>("public");
  const [checkStatus, setCheckStatus] = useState<CheckStatus>("idle");
  const [checkError, setCheckError] = useState<string | null>(null);
  const [history, setHistory] = useState<PublishRow[]>([]);
  const [deployLive, setDeployLive] = useState<ProjectDeployStatus>("idle");
  const [deployLiveError, setDeployLiveError] = useState<string | null>(null);
  const [liveRepo, setLiveRepo] = useState<string | null>(githubRepo ?? null);
  const [liveHost, setLiveHost] = useState<string | null>(siteHost ?? null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [gateBlock, setGateBlock] = useState<{ overallScore: number; status: string } | null>(null);
  const [pendingApproval, setPendingApproval] = useState<{
    approvalId: string;
    summary: string;
    risk: GafcoreRiskAssessment;
  } | null>(null);

  const callDeployStatus = useServerFn(getProjectDeployStatus);
  const callVerifySite = useServerFn(verifyDeploySite);
  const requestApproval = useServerFn(requestGafcoreCriticalApproval);

  const rawHost = liveHost ?? siteHost ?? null;
  const hostBlocked = isBlockedDeployHost(rawHost);
  const host = hostBlocked ? null : normalizeDeployHost(rawHost);
  const fullUrl = host ? `https://${host}` : null;
  const publishOkCount = history.filter((h) => h.status === "ok").length;
  const isLive = deployLive === "ready" || checkStatus === "ok";
  const isBuilding = isUpdating || deployLive === "building";
  const upToDate = isLive && !isBuilding && !deployLiveError && githubConfigured;

  const setOpenBoth = (v: boolean) => {
    setOpen(v);
    onOpenChange?.(v);
  };

  const reloadHistory = useCallback(async () => {
    setHistory(await listPublishes(12, projectId ?? undefined));
  }, [projectId]);

  const runVerification = useCallback(
    async (publishId?: string | null, verifyHost?: string | null) => {
      const target = normalizeDeployHost(verifyHost ?? host);
      if (!target) {
        setCheckStatus("fail");
        setCheckError(
          hostBlocked
            ? "No uses gafcore.com. Pon tu URL de Vercel en Editar configuración."
            : "Aún no hay URL. Publica primero.",
        );
        return;
      }
      setCheckStatus("running");
      setCheckError(null);
      try {
        const result = await callVerifySite({
          data: { host: target, ...(projectId ? { projectId } : {}) },
        });
        setCheckStatus(result.ok ? "ok" : "fail");
        setCheckError(result.ok ? null : (result.error ?? "No responde"));
        if (publishId) {
          void updatePublishRecord(publishId, {
            status: result.ok ? "ok" : "fail",
            http_status: result.httpStatus ?? null,
            latency_ms: result.ms ?? null,
            error: result.ok ? null : result.error ?? "fail",
          });
        }
      } catch (e: unknown) {
        setCheckStatus("fail");
        setCheckError(e instanceof Error ? e.message : "Error");
      }
    },
    [host, hostBlocked, projectId, callVerifySite],
  );

  const pollDeployStatus = useCallback(async () => {
    if (!projectId) return;
    try {
      const row = await callDeployStatus({ data: { projectId } });
      const st = (row?.status ?? "idle") as ProjectDeployStatus;
      setDeployLive(st);
      setDeployLiveError(row?.error ?? null);
      if (row?.siteHost && !isBlockedDeployHost(row.siteHost)) setLiveHost(row.siteHost);
      if (row?.githubRepo) setLiveRepo(row.githubRepo);
      if (st === "ready") {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        const h = normalizeDeployHost(row?.siteHost ?? host);
        if (h) void runVerification(undefined, h);
      }
      if (st === "error" && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } catch {
      /* */
    }
  }, [projectId, callDeployStatus, host, runVerification]);

  const startDeployPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    setDeployLive("building");
    setDeployLiveError(null);
    void pollDeployStatus();
    pollRef.current = setInterval(() => void pollDeployStatus(), 8000);
    setTimeout(() => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 180_000);
  }, [pollDeployStatus]);

  useEffect(() => {
    setLiveHost(siteHost ?? null);
  }, [siteHost]);

  useEffect(() => {
    setLiveRepo(githubRepo ?? null);
  }, [githubRepo]);

  useEffect(() => {
    if (open) {
      void reloadHistory();
      if (projectId) void pollDeployStatus();
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open, reloadHistory, projectId, pollDeployStatus]);

  const handlePublish = async () => {
    if (!githubConfigured) {
      openSetup();
      return;
    }
    if (!hasProject || !projectId) {
      toast.error("Crea un proyecto primero (+ Nuevo).");
      return;
    }
    if (!onUpdate) return;

    try {
      const approval = await requestApproval({
        data: {
          action: "project.publish",
          projectId,
          projectName,
        },
      });
      setPendingApproval({
        approvalId: approval.approvalId,
        summary: approval.summary,
        risk: approval.risk,
      });
      setConfirmOpen(true);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "No se pudo preparar la publicación");
    }
  };

  const executePublish = async () => {
    if (!onUpdate || !pendingApproval) return;
    setConfirmBusy(true);
    try {
      const result = await onUpdate({ approvalId: pendingApproval.approvalId });
      setConfirmOpen(false);

      if (!result.ok) {
        if (result.gateInfo) {
          setGateBlock({ overallScore: result.gateInfo.overallScore, status: result.gateInfo.status });
          toast.error('Publicación bloqueada', {
            description: `Calidad ${result.gateInfo.overallScore}/100 — corrige los errores antes de publicar.`,
          });
        } else {
          toast.error(result.message);
        }
        return;
      }
      setGateBlock(null);

      if (result.siteHost && !isBlockedDeployHost(result.siteHost)) {
        setLiveHost(result.siteHost);
      }
      if (result.repoUrl) {
        const m = result.repoUrl.match(/github\.com\/([^/]+\/[^/]+)/);
        if (m?.[1]) setLiveRepo(m[1]);
      }

      const verifyHost = normalizeDeployHost(result.siteHost ?? host);
      const publishId = await recordPublish({
        projectId: projectId ?? undefined,
        url: verifyHost ? `https://${verifyHost}` : undefined,
        visibility,
        status: "pending",
        fileCount: result.fileCount ?? 0,
        metadata: { repoUrl: result.repoUrl, message: result.message },
      });

      toast.success("Publicando…");
      void reloadHistory();

      if (result.deployStatus === "building") {
        startDeployPolling();
      } else if (verifyHost) {
        setTimeout(() => void runVerification(publishId, verifyHost), 5000);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al publicar");
    } finally {
      setConfirmBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!fullUrl) return;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  const openSetup = () => {
    setOpenBoth(false);
    onOpenSettings?.();
  };

  const mainButtonLabel = () => {
    if (!githubConfigured) return "Conectar GitHub";
    if (isBuilding) return "Compilando…";
    if (deployLive === "error") return "Reintentar";
    if (upToDate) return "Al día";
    return host ? "Actualizar sitio" : "Publicar sitio";
  };

  return (
    <>
    <Dialog open={open} onOpenChange={setOpenBoth}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="gap-0 overflow-hidden border border-border/80 bg-card p-0 shadow-2xl sm:max-w-[400px] rounded-2xl [&>button.absolute]:hidden">
        {/* Cabecera — Lovable */}
        <div className="flex items-center justify-between px-5 pt-5 pb-1">
          <h2 className="text-[17px] font-semibold text-foreground">Publicado</h2>
          <div className="flex items-center gap-2">
            {isLive && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Activity className="h-3.5 w-3.5 text-primary" />
                {publishOkCount > 0 ? `${publishOkCount} en línea` : "En línea"}
              </span>
            )}
            <DialogClose className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="h-4 w-4" />
              <span className="sr-only">Cerrar</span>
            </DialogClose>
          </div>
        </div>

        <div className="space-y-4 px-5 pb-4 pt-3">
          {/* URL */}
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              URL del sitio web
            </p>
            {host ? (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-foreground">
                  {host}
                </span>
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-primary" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
                <a
                  href={fullUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                {hostBlocked
                  ? "Quita gafcore.com en configuración. Usa tu URL de Vercel."
                  : "Aparecerá aquí al publicar (ej. mi-app.vercel.app)."}
              </p>
            )}
            {onOpenSettings && (
              <button
                type="button"
                onClick={openSetup}
                className="text-xs font-medium text-primary hover:underline"
              >
                Administrar dominio
              </button>
            )}
          </div>

          {/* Visibilidad — una fila como Lovable */}
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Quién puede ver este sitio
            </p>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 px-3 py-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                <Globe className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Público</p>
                <p className="text-xs text-muted-foreground">Cualquiera con el enlace</p>
              </div>
            </div>
          </div>

          {/* Botones secundarios */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-xl text-xs font-medium"
              disabled={!host || checkStatus === "running"}
              onClick={() => void runVerification()}
            >
              <Shield className="mr-1.5 h-3.5 w-3.5" />
              Revisar seguridad
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-xl text-xs font-medium"
              onClick={openSetup}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Editar configuración
            </Button>
          </div>

          {!githubConfigured && (
            <div className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 text-xs text-muted-foreground">
              <Github className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                Conecta GitHub en <strong className="text-foreground">Editar configuración</strong>{" "}
                (token <code className="text-foreground">repo</code>).
              </span>
            </div>
          )}

          {(deployLiveError || checkError) && (
            <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {deployLiveError ?? checkError}
            </p>
          )}

          {liveRepo && (
            <p className="truncate text-[11px] text-muted-foreground">
              <Github className="mr-1 inline h-3 w-3" />
              {liveRepo}
            </p>
          )}
        </div>

        {/* CTA — botón ancho “Al día” estilo Lovable */}
        <div className="px-5 pb-5 pt-1 space-y-3">
          <Button
            type="button"
            disabled={isBuilding || (upToDate && githubConfigured)}
            onClick={() => void handlePublish()}
            className={
              "h-11 w-full rounded-xl text-sm font-semibold shadow-none " +
              (upToDate
                ? "bg-primary/15 text-primary hover:bg-primary/20"
                : "bg-primary text-primary-foreground hover:bg-primary/90")
            }
          >
            {isBuilding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mainButtonLabel()}
          </Button>

          {/* Gate de validación — panel bloqueado */}
          {gateBlock && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                  <Shield className="h-4 w-4 shrink-0" />
                  Publicación bloqueada
                </div>
                <span className="text-xs font-mono font-bold text-destructive">
                  {gateBlock.overallScore}/100
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-destructive/20 overflow-hidden">
                <div
                  className="h-full rounded-full bg-destructive transition-all duration-500"
                  style={{ width: `${gateBlock.overallScore}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                El proyecto no supera el umbral mínimo de calidad.
                Abre el chat <strong>Construir</strong> y GafCore lo corregirá automáticamente.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full h-8 text-xs"
                onClick={() => { setGateBlock(null); setOpen(false); }}
              >
                Cerrar y corregir en el chat
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
    <CriticalActionConfirmDialog
      open={confirmOpen}
      onOpenChange={setConfirmOpen}
      title="Confirmar publicación"
      summary={pendingApproval?.summary ?? "Publicar cambios a producción."}
      risk={pendingApproval?.risk ?? null}
      confirmLabel="Publicar ahora"
      busy={confirmBusy || isUpdating}
      onConfirm={executePublish}
    />
    </>
  );
}
