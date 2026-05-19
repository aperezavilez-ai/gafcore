import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
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
  Radio,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  listPublishes,
  recordPublish,
  updatePublishRecord,
  type PublishRow,
} from "@/lib/userSupabase";
import type { GafcoreDeployResult, ProjectDeployStatus } from "@/lib/gafcore-deploy.shared";
import { isBlockedDeployHost, normalizeDeployHost } from "@/lib/gafcore-deploy.shared";
import { getProjectDeployStatus, verifyDeploySite } from "@/lib/gafcore-deploy.functions";

type CheckStatus = "idle" | "running" | "ok" | "fail";
type CheckResult = {
  status: CheckStatus;
  httpStatus?: number;
  ms?: number;
  error?: string;
};

type Visibility = "public" | "private";

type Props = {
  children: React.ReactNode;
  siteHost?: string | null;
  githubRepo?: string | null;
  projectId?: string | null;
  hasProject?: boolean;
  githubConfigured?: boolean;
  isUpdating?: boolean;
  onUpdate?: () => Promise<GafcoreDeployResult>;
  onOpenSettings?: () => void;
  onOpenChange?: (open: boolean) => void;
};

export function PublishDialog({
  children,
  siteHost,
  githubRepo,
  projectId,
  hasProject = true,
  githubConfigured = false,
  isUpdating = false,
  onUpdate,
  onOpenSettings,
  onOpenChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [check, setCheck] = useState<CheckResult>({ status: "idle" });
  const [history, setHistory] = useState<PublishRow[]>([]);
  const [deployLive, setDeployLive] = useState<ProjectDeployStatus>("idle");
  const [deployLiveError, setDeployLiveError] = useState<string | null>(null);
  const [liveRepo, setLiveRepo] = useState<string | null>(githubRepo ?? null);
  const [liveHost, setLiveHost] = useState<string | null>(siteHost ?? null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const callDeployStatus = useServerFn(getProjectDeployStatus);
  const callVerifySite = useServerFn(verifyDeploySite);

  const host = normalizeDeployHost(liveHost ?? siteHost ?? null);
  const hostBlocked = isBlockedDeployHost(liveHost ?? siteHost ?? null);
  const fullUrl = host ? `https://${host}` : null;
  const canPublish = hasProject && githubConfigured;

  const lastOkPublish = history.find((h) => h.status === "ok");
  const hasPublished = Boolean(lastOkPublish || host);
  const publishCount = history.filter((h) => h.status === "ok").length;

  const primaryLabel = useMemo(() => {
    if (isUpdating || deployLive === "building") return "Compilando…";
    if (deployLive === "error") return "Reintentar publicación";
    if (!githubConfigured) return "Conectar GitHub";
    if (!hasPublished) return "Publicar sitio";
    return "Actualizar sitio";
  }, [isUpdating, deployLive, githubConfigured, hasPublished]);

  const upToDate =
    hasPublished &&
    deployLive !== "building" &&
    deployLive !== "error" &&
    !isUpdating &&
    check.status === "ok";

  const setOpenBoth = (v: boolean) => {
    setOpen(v);
    onOpenChange?.(v);
  };

  const reloadHistory = useCallback(async () => {
    const rows = await listPublishes(12, projectId ?? undefined);
    setHistory(rows);
  }, [projectId]);

  const runVerification = useCallback(async (publishId?: string | null, verifyHost?: string | null) => {
    const target = normalizeDeployHost(verifyHost ?? host);
    if (!target) {
      const err = hostBlocked
        ? "gafcore.com es la plataforma IDE, no tu sitio. Configura tu URL de Vercel (xxx.vercel.app)."
        : "Configura la URL del sitio en Editar configuración";
      setCheck({ status: "fail", error: err });
      if (publishId) void updatePublishRecord(publishId, { status: "fail", error: "missing_deploy_site_url" });
      toast.error(err);
      return;
    }

    setCheck({ status: "running" });
    try {
      const result = await callVerifySite({
        data: { host: target, ...(projectId ? { projectId } : {}) },
      });
      setCheck({
        status: result.ok ? "ok" : "fail",
        httpStatus: result.httpStatus,
        ms: result.ms,
        error: result.ok ? undefined : result.error,
      });
      if (publishId) {
        void updatePublishRecord(publishId, {
          status: result.ok ? "ok" : "fail",
          http_status: result.httpStatus ?? null,
          latency_ms: result.ms ?? null,
          error: result.ok ? null : result.error ?? "verify_failed",
        });
      }
      if (result.ok) toast.success(`Sitio en vivo (${result.ms ?? "?"} ms)`);
      else toast.error(result.error ?? "Verificación falló");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Error desconocido";
      setCheck({ status: "fail", error: message });
      if (publishId) void updatePublishRecord(publishId, { status: "fail", error: message });
      toast.error("No se pudo verificar: " + message);
    }
  }, [host, hostBlocked, projectId, callVerifySite]);

  const pollDeployStatus = useCallback(async () => {
    if (!projectId) return;
    try {
      const row = await callDeployStatus({ data: { projectId } });
      const st = (row?.status ?? "idle") as ProjectDeployStatus;
      setDeployLive(st);
      setDeployLiveError(row?.error ?? null);
      if (row?.siteHost) setLiveHost(row.siteHost);
      if (row?.githubRepo) setLiveRepo(row.githubRepo);
      if (st === "ready") {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        const verifyTarget = normalizeDeployHost(row?.siteHost ?? host);
        if (verifyTarget) void runVerification(undefined, verifyTarget);
        toast.success("Deploy completado");
      }
      if (st === "error") {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        toast.error(row?.error ?? "Deploy fallido en Vercel");
      }
    } catch {
      /* migración pendiente */
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

  const handleUpdate = async () => {
    if (!githubConfigured) {
      openSetup();
      return;
    }
    if (!hasProject) {
      toast.error("Crea o selecciona un proyecto (+ Nuevo en el menú).");
      return;
    }
    if (!onUpdate) return;

    let result: GafcoreDeployResult;
    try {
      result = await onUpdate();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al publicar");
      return;
    }

    if (!result.ok) {
      toast.error(result.message, {
        action: onOpenSettings ? { label: "Configuración", onClick: onOpenSettings } : undefined,
        duration: 10_000,
      });
      return;
    }

    const verifyHost = normalizeDeployHost(result.siteHost ?? host);
    if (result.siteHost) setLiveHost(result.siteHost);
    if (result.repoUrl) {
      const m = result.repoUrl.match(/github\.com\/([^/]+\/[^/]+)/);
      if (m?.[1]) setLiveRepo(m[1]);
    }

    const urlForRecord = verifyHost ? `https://${verifyHost}` : fullUrl;
    const publishId = await recordPublish({
      projectId: projectId ?? undefined,
      url: urlForRecord ?? undefined,
      visibility,
      status: "pending",
      fileCount: result.fileCount ?? 0,
      metadata: { repoUrl: result.repoUrl, message: result.message },
    });

    toast.success(result.message);
    void reloadHistory();

    if (result.deployStatus === "building") {
      startDeployPolling();
    } else if (verifyHost) {
      setTimeout(() => void runVerification(publishId, verifyHost), 4000);
    } else {
      toast.message(
        "Código en GitHub. Si tienes VERCEL_TOKEN en el servidor, el sitio se activará en unos minutos.",
        { duration: 8000 },
      );
    }
  };

  const handleCopy = async () => {
    if (!fullUrl) {
      toast.error("Aún no hay URL pública. Publica primero o configura Vercel.");
      return;
    }
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("URL copiada");
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  const openSetup = () => {
    setOpenBoth(false);
    onOpenSettings?.();
  };

  return (
    <Dialog open={open} onOpenChange={setOpenBoth}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="gap-0 overflow-hidden border-border p-0 sm:max-w-[420px]">
        {/* Header estilo Lovable */}
        <div className="flex items-start justify-between border-b border-border px-5 pb-4 pt-5">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {hasPublished ? "Publicado" : "Publicar"}
            </h2>
            {publishCount > 0 && (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Radio className="h-3 w-3 text-primary" />
                {publishCount} {publishCount === 1 ? "publicación" : "publicaciones"} exitosas
              </p>
            )}
          </div>
          {deployLive === "building" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              Compilando
            </span>
          )}
        </div>

        <div className="space-y-5 px-5 py-4">
          {!githubConfigured ? (
            <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Github className="h-4 w-4" />
                Conecta GitHub para publicar
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Un solo paso: token con permiso <code className="text-foreground">repo</code>. GafCore
                crea el repositorio y despliega en Vercel automáticamente.
              </p>
              <Button onClick={openSetup} className="w-full gap-2">
                <SettingsIcon className="h-4 w-4" />
                Conectar GitHub
              </Button>
            </div>
          ) : null}

          {hostBlocked && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <strong>gafcore.com</strong> no es la URL de tu app. En configuración pon tu dominio de
              Vercel, por ejemplo <code className="font-mono">mi-agencia.vercel.app</code>.
            </p>
          )}

          {/* Website URL */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">URL del sitio web</p>
            {host ? (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
                <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                  {host}
                </span>
                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Copiar"
                >
                  {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
                </button>
                <a
                  href={fullUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Abrir"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Se generará al publicar (Vercel: <span className="font-mono text-foreground">*.vercel.app</span>
                ).
              </p>
            )}
            {onOpenSettings && (
              <button
                type="button"
                onClick={openSetup}
                className="text-xs font-medium text-primary hover:underline"
              >
                Gestionar dominio y configuración
              </button>
            )}
          </div>

          {/* Visibilidad */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Quién puede ver este sitio</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setVisibility("public")}
                className={
                  "flex flex-1 items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition " +
                  (visibility === "public"
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted/50")
                }
              >
                <Globe className="h-4 w-4 shrink-0" />
                <span>
                  <span className="block font-medium">Público</span>
                  <span className="text-[11px] text-muted-foreground">Cualquiera con el enlace</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setVisibility("private")}
                className={
                  "flex flex-1 items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition " +
                  (visibility === "private"
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted/50")
                }
              >
                <Users className="h-4 w-4 shrink-0" />
                <span>
                  <span className="block font-medium">Privado</span>
                  <span className="text-[11px] text-muted-foreground">Solo tú (repo privado)</span>
                </span>
              </button>
            </div>
          </div>

          {/* Acciones secundarias */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5 text-xs"
              onClick={() => void runVerification()}
              disabled={check.status === "running" || !host}
            >
              <Shield className="h-3.5 w-3.5" />
              Revisar sitio
            </Button>
            {onOpenSettings && (
              <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs" onClick={openSetup}>
                <Pencil className="h-3.5 w-3.5" />
                Editar configuración
              </Button>
            )}
          </div>

          {liveRepo && (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Github className="h-3.5 w-3.5" />
              <span className="truncate">{liveRepo}</span>
            </p>
          )}

          {deployLiveError && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {deployLiveError}
            </p>
          )}

          {check.status === "fail" && check.error && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {check.error}
            </p>
          )}
        </div>

        {/* CTA principal estilo Lovable */}
        <div className="border-t border-border bg-muted/20 px-5 py-4">
          <Button
            onClick={() => void handleUpdate()}
            disabled={
              isUpdating ||
              check.status === "running" ||
              deployLive === "building" ||
              (upToDate && githubConfigured && hasProject)
            }
            className={
              "h-11 w-full rounded-xl text-sm font-semibold " +
              (upToDate
                ? "bg-primary/15 text-primary hover:bg-primary/20"
                : "bg-primary text-primary-foreground hover:bg-primary/90")
            }
          >
            {isUpdating || deployLive === "building" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Compilando en Vercel…
              </>
            ) : upToDate ? (
              "Al día"
            ) : (
              primaryLabel
            )}
          </Button>
          <p className="mt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
            Guarda, sube a GitHub y despliega en Vercel en un clic.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
