'use client';
/**
 * DeployWizardPanel — Flujo guiado de publicación para GafCore.
 *
 * Reemplaza los botones simples "Implementar / Validar" con un wizard
 * de 4 pasos que detecta automáticamente qué falta y lleva al usuario
 * exactamente donde necesita ir.
 *
 * Pasos:
 *  1. Preview OK        → confirmar que el proyecto se ve bien
 *  2. Conectar GitHub   → pedir token + nombre del repo
 *  3. Push a GitHub     → subir el código automáticamente
 *  4. Conectar Vercel   → webhook hook URL para deploy automático
 *  5. En vivo           → URL clickeable del proyecto publicado
 *
 * Uso en ChatPanel / GafCoreIDE:
 *   <DeployWizardPanel
 *     files={files}
 *     projectName={projectName}
 *     projectId={currentProjectId}
 *     loading={loading}
 *     onOpenSettings={openDeploySettings}
 *     onDeploy={onDeploy}
 *   />
 */

import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2, Circle, Loader2, Github, Globe, ExternalLink,
  ChevronRight, AlertTriangle, RefreshCw, Eye, Rocket, Link2,
  Copy, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getIdeConfig, setIdeConfig } from '@/lib/ideConfig';
import { isValidGithubRepo } from '@/lib/gafcore-deploy.shared';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { GitHubConnectButton } from '@/components/ide/GitHubConnectButton';

// ── Types ──────────────────────────────────────────────────────────────────

type DeployStep =
  | 'preview'      // Paso 1: revisar preview
  | 'github'       // Paso 2: conectar GitHub
  | 'pushing'      // Paso 3: subiendo a GitHub (en progreso)
  | 'vercel'       // Paso 4: conectar Vercel
  | 'deploying'    // Deploy en progreso
  | 'live';        // ¡Publicado!

type StepStatus = 'pending' | 'active' | 'done' | 'error';

interface WizardStep {
  id: DeployStep;
  label: string;
  shortLabel: string;
}

const WIZARD_STEPS: WizardStep[] = [
  { id: 'preview',  label: 'Revisar preview',    shortLabel: 'Preview'  },
  { id: 'github',   label: 'Conectar GitHub',     shortLabel: 'GitHub'   },
  { id: 'vercel',   label: 'Conectar Vercel',     shortLabel: 'Vercel'   },
  { id: 'live',     label: 'Publicado en vivo',   shortLabel: 'En vivo'  },
];

interface Props {
  files: Array<{ name: string; content: string }>;
  projectName?: string | null;
  projectId?: string | null;
  loading?: boolean;
  deploying?: boolean;
  deployLiveStatus?: 'idle' | 'building' | 'ready' | 'error';
  deploySiteHost?: string | null;
  githubRepo?: string | null;
  accessToken?: string | null;
  /** Abre el modal de configuración de deploy (SettingsDialog con scroll a GitHub) */
  onOpenSettings?: () => void;
  /** Dispara el push a GitHub + deploy */
  onDeploy?: () => Promise<{ ok: boolean; message: string; repoUrl?: string; siteHost?: string }>;
  className?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function deriveCurrentStep(opts: {
  loading: boolean;
  deploying: boolean;
  deployLiveStatus: string;
  deploySiteHost: string | null;
  hasGithub: boolean;
  hasVercel: boolean;
  hasPushed: boolean;
}): DeployStep {
  if (opts.deployLiveStatus === 'ready' && opts.deploySiteHost) return 'live';
  if (opts.deployLiveStatus === 'building' || opts.deploying) return 'deploying';
  if (opts.hasPushed && !opts.hasVercel) return 'vercel';
  if (opts.hasGithub && !opts.hasPushed) return 'pushing';
  if (!opts.hasGithub) return 'github';
  if (opts.loading) return 'preview';
  return 'preview';
}

function stepToWizardIndex(step: DeployStep): number {
  if (step === 'preview') return 0;
  if (step === 'github') return 1;
  if (step === 'pushing') return 1;
  if (step === 'vercel') return 2;
  if (step === 'deploying') return 2;
  if (step === 'live') return 3;
  return 0;
}

// ── Main Component ─────────────────────────────────────────────────────────

export function DeployWizardPanel({
  files,
  projectName,
  projectId,
  loading = false,
  deploying = false,
  deployLiveStatus = 'idle',
  deploySiteHost,
  githubRepo: externalGithubRepo,
  accessToken = null,
  onOpenSettings,
  onDeploy,
  className,
}: Props) {
  const [githubToken, setGithubToken] = useState('');
  const [githubRepo, setGithubRepo] = useState('');
  const [githubOAuthLogin, setGithubOAuthLogin] = useState<string | null>(null);
  const [vercelHookUrl, setVercelHookUrl] = useState('');
  const [hasPushed, setHasPushed] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(true);

  // Load saved config
  useEffect(() => {
    const cfg = getIdeConfig();
    if (cfg.githubToken) setGithubToken(cfg.githubToken);
    if (cfg.githubRepo) setGithubRepo(cfg.githubRepo);
    if (cfg.vercelDeployHookUrl) setVercelHookUrl(cfg.vercelDeployHookUrl);
    if (cfg.githubRepo && cfg.githubToken) setHasPushed(true);
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/gafcore/github-oauth-status', {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        });
        const data = (await res.json()) as {
          connected?: boolean;
          github_login?: string;
        };
        if (cancelled || !data.connected || !data.github_login) return;
        setGithubRepo(data.github_login);
        setGithubOAuthLogin(data.github_login);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const hasGithub = Boolean(
    githubOAuthLogin ||
      (githubToken.trim() && githubRepo.trim() && isValidGithubRepo(githubRepo)),
  );
  const hasVercel = Boolean(vercelHookUrl.trim());
  const isLive = deployLiveStatus === 'ready' && Boolean(deploySiteHost);

  const currentStep = deriveCurrentStep({
    loading, deploying,
    deployLiveStatus,
    deploySiteHost: deploySiteHost ?? null,
    hasGithub, hasVercel, hasPushed,
  });
  const activeWizardIdx = stepToWizardIndex(currentStep);

  // ── Push + Deploy ──────────────────────────────────────────────────────

  const handleDeploy = useCallback(async () => {
    if (!onDeploy) {
      toast.info('Abre Configuración → GitHub Deploy para configurar el deploy.');
      onOpenSettings?.();
      return;
    }
    setIsBusy(true);
    setPushError(null);
    try {
      const result = await onDeploy();
      if (result.ok) {
        setHasPushed(true);
        toast.success('¡Código subido a GitHub!', {
          description: result.repoUrl ? `Ver en ${result.repoUrl}` : 'Push completado',
        });
        if (result.siteHost) {
          toast.success('¡Sitio publicado!', { description: `https://${result.siteHost}` });
        }
      } else {
        setPushError(result.message);
        toast.error('Error al publicar', { description: result.message });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPushError(msg);
      toast.error('Error al publicar', { description: msg });
    } finally {
      setIsBusy(false);
    }
  }, [onDeploy, onOpenSettings]);

  // ── Save Vercel ────────────────────────────────────────────────────────

  const saveVercel = useCallback(async () => {
    const hook = vercelHookUrl.trim();
    if (!hook || !hook.startsWith('https://')) {
      toast.error('URL inválida', { description: 'Debe comenzar con https://' });
      return;
    }
    setIsBusy(true);
    try {
      // Trigger the hook to verify it works
      const res = await fetch(hook, { method: 'POST' });
      if (!res.ok) throw new Error(`Vercel respondió ${res.status}`);
      const cfg = getIdeConfig();
      setIdeConfig({ ...cfg, vercelDeployHookUrl: hook });
      toast.success('¡Vercel conectado!', { description: 'Deploy iniciado automáticamente' });
    } catch (err) {
      // Save anyway — some hooks don't respond with 200
      const cfg = getIdeConfig();
      setIdeConfig({ ...cfg, vercelDeployHookUrl: hook });
      toast.success('Vercel guardado', { description: 'El deploy se iniciará al publicar' });
    } finally {
      setIsBusy(false);
    }
  }, [vercelHookUrl]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const siteUrl = deploySiteHost
    ? `https://${deploySiteHost.replace(/^https?:\/\//, '')}`
    : null;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className={cn('rounded-lg border border-border bg-muted/20 overflow-hidden', className)}>
      {/* Header con stepper */}
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Mini stepper */}
          <div className="flex items-center gap-1">
            {WIZARD_STEPS.map((step, idx) => {
              const isDone = idx < activeWizardIdx || isLive;
              const isCurrent = idx === activeWizardIdx && !isLive;
              return (
                <div key={step.id} className="flex items-center">
                  <div className={cn(
                    'h-4 w-4 rounded-full flex items-center justify-center text-[8px] font-bold transition-all',
                    isDone && 'bg-primary/20 text-primary',
                    isCurrent && (deploying || isBusy)
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      : isCurrent
                        ? 'bg-primary/10 text-primary ring-1 ring-primary/40'
                        : !isDone && 'bg-muted text-muted-foreground',
                  )}>
                    {isDone
                      ? <CheckCircle2 className="h-2.5 w-2.5" />
                      : (deploying || isBusy) && isCurrent
                        ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        : <span>{idx + 1}</span>
                    }
                  </div>
                  {idx < WIZARD_STEPS.length - 1 && (
                    <div className={cn(
                      'h-px w-3 mx-0.5',
                      idx < activeWizardIdx ? 'bg-primary/40' : 'bg-border',
                    )} />
                  )}
                </div>
              );
            })}
          </div>
          <span className="text-[11px] text-muted-foreground truncate">
            {isLive
              ? '¡Proyecto publicado y en vivo!'
              : deploying || isBusy
                ? 'Publicando...'
                : currentStep === 'preview'
                  ? 'Revisa el preview y publica'
                  : currentStep === 'github'
                    ? 'Conecta GitHub para publicar'
                    : currentStep === 'vercel'
                      ? 'Conecta Vercel para el deploy'
                      : 'Listo para publicar'}
          </span>
        </div>
        <ChevronRight className={cn(
          'h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0',
          expanded && 'rotate-90',
        )} />
      </button>

      {/* Body expandible */}
      {expanded && (
        <div className="border-t border-border px-3 py-3 space-y-3">

          {/* ── PASO 1: Preview OK ────────────────────────────────── */}
          {currentStep === 'preview' && !hasGithub && (
            <StepCard
              number={1}
              icon={<Eye className="h-3.5 w-3.5" />}
              title="Revisa el preview"
              description="Asegúrate de que tu proyecto se vea bien en el panel derecho."
              status="active"
            >
              <Button
                size="sm"
                className="h-7 text-[11px] w-full mt-2"
                onClick={() => {
                  // Trigger move to GitHub step by setting config visible
                  setExpanded(true);
                }}
              >
                <Github className="h-3 w-3 mr-1.5" />
                Se ve bien → Conectar GitHub
              </Button>
            </StepCard>
          )}

          {/* ── PASO 2: Conectar GitHub ───────────────────────────── */}
          {(!hasGithub || currentStep === 'github') && (
            <StepCard
              number={2}
              icon={<Github className="h-3.5 w-3.5" />}
              title="Conectar GitHub"
              description="Sube tu código a GitHub para desplegarlo en Vercel."
              status={hasGithub ? 'done' : 'active'}
            >
              {!hasGithub && (
                <div className="mt-2 space-y-2">
                  <GitHubConnectButton
                    accessToken={accessToken}
                    onConnected={(login) => {
                      setGithubRepo(login);
                      setGithubOAuthLogin(login);
                      toast.success(`GitHub conectado como @${login}`);
                    }}
                    onDisconnected={() => {
                      setGithubRepo('');
                      setGithubOAuthLogin(null);
                    }}
                  />
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="w-full text-center text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    Configuración avanzada →
                  </button>
                </div>
              )}
              {hasGithub && (
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-primary">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">@{githubOAuthLogin ?? (githubRepo || externalGithubRepo)}</span>
                </div>
              )}
            </StepCard>
          )}

          {/* ── PASO 3: Push + Deploy ─────────────────────────────── */}
          {hasGithub && (
            <StepCard
              number={3}
              icon={
                isBusy || deploying
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Rocket className="h-3.5 w-3.5" />
              }
              title="Subir a GitHub"
              description="Sube tu código y activa el deploy automáticamente."
              status={hasPushed ? 'done' : 'active'}
            >
              {!hasPushed && (
                <Button
                  size="sm"
                  className="h-7 text-[11px] w-full mt-2"
                  onClick={handleDeploy}
                  disabled={isBusy || deploying || loading}
                >
                  {isBusy || deploying
                    ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Subiendo código…</>
                    : <><Rocket className="h-3 w-3 mr-1.5" /> Subir y publicar</>
                  }
                </Button>
              )}
              {hasPushed && !pushError && (
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-primary">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  <span>Código en GitHub · {githubRepo}</span>
                </div>
              )}
              {pushError && (
                <div className="mt-2 rounded-md bg-destructive/10 px-2 py-1.5 text-[10px] text-destructive space-y-1">
                  <div className="flex items-center gap-1 font-medium">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    Error al publicar
                  </div>
                  <p>{pushError}</p>
                  <Button size="sm" variant="outline" className="h-6 text-[10px] mt-1" onClick={handleDeploy}>
                    <RefreshCw className="h-2.5 w-2.5 mr-1" /> Reintentar
                  </Button>
                </div>
              )}
            </StepCard>
          )}

          {/* ── PASO 4: Conectar Vercel ───────────────────────────── */}
          {hasPushed && !isLive && (
            <StepCard
              number={4}
              icon={<Globe className="h-3.5 w-3.5" />}
              title="Conectar Vercel"
              description="Agrega el Deploy Hook de Vercel para publicar en tu dominio."
              status={hasVercel ? 'done' : 'active'}
            >
              {!hasVercel && (
                <div className="mt-2 space-y-2">
                  <div className="rounded-md bg-muted/40 p-2 text-[10px] text-muted-foreground space-y-1">
                    <p className="font-medium text-foreground">Cómo obtener el Deploy Hook:</p>
                    <p>1. Ve a <a href="https://vercel.com/new" target="_blank" rel="noreferrer" className="text-primary hover:underline">vercel.com/new</a> e importa tu repo de GitHub</p>
                    <p>2. En tu proyecto → Settings → Git → Deploy Hooks</p>
                    <p>3. Crea un hook y pega la URL aquí</p>
                  </div>
                  <Input
                    placeholder="https://api.vercel.com/v1/integrations/deploy/..."
                    value={vercelHookUrl}
                    onChange={e => setVercelHookUrl(e.target.value)}
                    className="h-7 text-[11px]"
                  />
                  <Button
                    size="sm"
                    className="h-7 text-[11px] w-full"
                    onClick={saveVercel}
                    disabled={isBusy || !vercelHookUrl.trim()}
                  >
                    {isBusy
                      ? <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Conectando…</>
                      : <><Link2 className="h-3 w-3 mr-1.5" /> Conectar Vercel</>
                    }
                  </Button>
                </div>
              )}
              {hasVercel && !isLive && (
                <div className="mt-1.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] text-primary">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span>Vercel conectado · Deploy en progreso…</span>
                    <Loader2 className="h-3 w-3 animate-spin ml-auto" />
                  </div>
                </div>
              )}
            </StepCard>
          )}

          {/* ── PASO 5: En vivo ───────────────────────────────────── */}
          {isLive && siteUrl && (
            <div className="rounded-md bg-primary/10 border border-primary/20 px-3 py-2.5 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <Globe className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <p className="text-[12px] font-semibold text-foreground">¡Tu proyecto está en vivo!</p>
                  <p className="text-[10px] text-muted-foreground truncate">{siteUrl}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-7 text-[11px] flex-1"
                  onClick={() => window.open(siteUrl, '_blank')}
                >
                  <ExternalLink className="h-3 w-3 mr-1.5" />
                  Abrir sitio
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  onClick={() => copyToClipboard(siteUrl)}
                >
                  {copied
                    ? <Check className="h-3 w-3" />
                    : <Copy className="h-3 w-3" />
                  }
                </Button>
              </div>
              <button
                type="button"
                onClick={handleDeploy}
                disabled={isBusy || deploying}
                className="w-full text-center text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50 flex items-center justify-center gap-1"
              >
                <RefreshCw className={cn('h-2.5 w-2.5', (isBusy || deploying) && 'animate-spin')} />
                Actualizar con últimos cambios
              </button>
            </div>
          )}

          {/* Building indicator */}
          {(deployLiveStatus === 'building' || (deploying && !isBusy)) && !isLive && (
            <div className="flex items-center gap-2 text-[11px] text-amber-600 dark:text-amber-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
              <span>Deploy en progreso en Vercel… esto puede tardar 1-3 min.</span>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

// ── StepCard sub-component ─────────────────────────────────────────────────

function StepCard({
  number,
  icon,
  title,
  description,
  status,
  children,
}: {
  number: number;
  icon: React.ReactNode;
  title: string;
  description: string;
  status: StepStatus;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn(
      'rounded-md border px-3 py-2 transition-all',
      status === 'active' && 'border-primary/30 bg-primary/5',
      status === 'done' && 'border-border bg-muted/20 opacity-70',
      status === 'pending' && 'border-border bg-transparent opacity-50',
      status === 'error' && 'border-destructive/30 bg-destructive/5',
    )}>
      <div className="flex items-start gap-2">
        <div className={cn(
          'mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold',
          status === 'done' && 'bg-primary/20 text-primary',
          status === 'active' && 'bg-primary/10 text-primary ring-1 ring-primary/40',
          status === 'pending' && 'bg-muted text-muted-foreground',
          status === 'error' && 'bg-destructive/20 text-destructive',
        )}>
          {status === 'done'
            ? <CheckCircle2 className="h-3 w-3" />
            : icon
          }
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn(
            'text-[12px] font-medium leading-tight',
            status === 'active' ? 'text-foreground' : 'text-muted-foreground',
          )}>
            {title}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{description}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
