'use client';
/**
 * GitHubConnectButton
 *
 * Reemplaza el formulario manual de "pegar token" con un botón OAuth.
 * El usuario hace click → autoriza en GitHub → vuelve conectado automáticamente.
 *
 * También muestra el estado actual (conectado/desconectado) y permite desconectar.
 *
 * Uso:
 *   <GitHubConnectButton
 *     accessToken={sessionToken}
 *     onConnected={(login) => console.log('Conectado como', login)}
 *   />
 */

import { useCallback, useEffect, useState } from 'react';
import { Github, CheckCircle2, Loader2, ExternalLink, LogOut, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type ConnectionStatus =
  | { state: 'loading' }
  | { state: 'disconnected'; oauthAvailable: boolean }
  | { state: 'connected'; login: string; scopes: string | null }
  | { state: 'error'; message: string };

interface Props {
  accessToken: string | null;
  onConnected?: (login: string) => void;
  onDisconnected?: () => void;
  className?: string;
  compact?: boolean;
}

export function GitHubConnectButton({
  accessToken,
  onConnected,
  onDisconnected,
  className,
  compact = false,
}: Props) {
  const [status, setStatus] = useState<ConnectionStatus>({ state: 'loading' });
  const [disconnecting, setDisconnecting] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!accessToken) {
      setStatus({ state: 'disconnected', oauthAvailable: false });
      return;
    }
    try {
      const res = await fetch('/api/gafcore/github-oauth-status', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      const data = (await res.json()) as {
        ok?: boolean;
        connected?: boolean;
        github_login?: string;
        scopes?: string;
        oauth_available?: boolean;
      };
      if (!res.ok || !data.ok) {
        setStatus({ state: 'error', message: 'No se pudo verificar el estado de GitHub' });
        return;
      }
      if (data.connected && data.github_login) {
        setStatus({ state: 'connected', login: data.github_login, scopes: data.scopes ?? null });
      } else {
        setStatus({ state: 'disconnected', oauthAvailable: data.oauth_available ?? false });
      }
    } catch {
      setStatus({ state: 'error', message: 'Error de conexión' });
    }
  }, [accessToken]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  // Detectar retorno del callback OAuth
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('github_connected');
    const login = params.get('github_login');
    const oauthError = params.get('oauth_error');

    if (connected === '1' && login) {
      toast.success(`¡GitHub conectado como @${login}!`, {
        description: 'Tu código se publicará en tu cuenta de GitHub.',
      });
      setStatus({ state: 'connected', login, scopes: null });
      onConnected?.(login);
      // Limpiar params de la URL
      const clean = new URL(window.location.href);
      clean.searchParams.delete('github_connected');
      clean.searchParams.delete('github_login');
      window.history.replaceState({}, '', clean.toString());
    }

    if (oauthError) {
      toast.error('Error al conectar GitHub', { description: decodeURIComponent(oauthError) });
      const clean = new URL(window.location.href);
      clean.searchParams.delete('oauth_error');
      window.history.replaceState({}, '', clean.toString());
    }
  }, [onConnected]);

  const handleConnect = () => {
    if (!accessToken) {
      toast.error('Inicia sesión primero');
      return;
    }
    const redirectTo = window.location.pathname + window.location.search;
    window.location.href = `/api/gafcore/github-oauth-start?redirect_to=${encodeURIComponent(redirectTo)}`;
  };

  const handleDisconnect = async () => {
    if (!accessToken) return;
    setDisconnecting(true);
    try {
      const res = await fetch('/api/gafcore/github-oauth-status', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        setStatus({ state: 'disconnected', oauthAvailable: true });
        toast.success('GitHub desconectado');
        onDisconnected?.();
      } else {
        toast.error('Error al desconectar GitHub');
      }
    } finally {
      setDisconnecting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────

  if (status.state === 'loading') {
    return (
      <div className={cn('flex items-center gap-2 text-muted-foreground', className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-[12px]">Verificando GitHub…</span>
      </div>
    );
  }

  if (status.state === 'connected') {
    if (compact) {
      return (
        <div className={cn('flex items-center gap-1.5', className)}>
          <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-[11px] text-primary font-medium truncate">
            @{status.login}
          </span>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="ml-1 text-[10px] text-muted-foreground hover:text-destructive"
          >
            {disconnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
          </button>
        </div>
      );
    }

    return (
      <div className={cn('rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5', className)}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Github className="h-4 w-4 text-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-foreground">GitHub conectado</p>
              <p className="text-[11px] text-muted-foreground">@{status.login}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[10px] text-muted-foreground hover:text-destructive px-2"
              onClick={handleDisconnect}
              disabled={disconnecting}
            >
              {disconnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Desconectar'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (status.state === 'error') {
    return (
      <div className={cn('flex items-center gap-2 text-destructive/80', className)}>
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="text-[11px]">{status.message}</span>
        <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={fetchStatus}>
          Reintentar
        </Button>
      </div>
    );
  }

  // state === 'disconnected'
  const oauthAvailable = status.oauthAvailable;

  return (
    <div className={cn('space-y-2', className)}>
      {oauthAvailable ? (
        // OAuth disponible — botón directo, sin copiar tokens
        <Button
          size="sm"
          className="h-8 w-full gap-2 text-[12px]"
          onClick={handleConnect}
        >
          <Github className="h-4 w-4" />
          Conectar con GitHub
        </Button>
      ) : (
        // OAuth no configurado — fallback a formulario manual
        <div className="space-y-2">
          <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
            <p className="font-medium mb-1">Conecta tu cuenta de GitHub</p>
            <p className="text-[10px] opacity-80">
              Ve a{' '}
              <a
                href="https://github.com/settings/tokens/new?scopes=repo,read:user&description=GafCore"
                target="_blank"
                rel="noreferrer"
                className="underline font-medium inline-flex items-center gap-0.5"
              >
                github.com/settings/tokens
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
              , genera un token con permiso <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">repo</code> y pégalo en Configuración → GitHub Deploy.
            </p>
          </div>
        </div>
      )}
      <p className="text-[10px] text-muted-foreground text-center">
        Tu código se publicará en <strong>tu cuenta</strong> de GitHub, no en la de GafCore.
      </p>
    </div>
  );
}
