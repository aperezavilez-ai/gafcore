'use client';
/**
 * VercelConnectButton
 * Botón OAuth para conectar la cuenta Vercel del usuario.
 * Un click → autoriza en vercel.com → vuelve conectado.
 */

import { useCallback, useEffect, useState } from 'react';
import { Globe, CheckCircle2, Loader2, LogOut, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Status =
  | { state: 'loading' }
  | { state: 'disconnected'; oauthAvailable: boolean }
  | { state: 'connected'; username: string; teamId: string | null }
  | { state: 'error'; message: string };

interface Props {
  accessToken: string | null;
  onConnected?: (username: string) => void;
  onDisconnected?: () => void;
  className?: string;
  compact?: boolean;
}

export function VercelConnectButton({
  accessToken,
  onConnected,
  onDisconnected,
  className,
  compact = false,
}: Props) {
  const [status, setStatus] = useState<Status>({ state: 'loading' });
  const [disconnecting, setDisconnecting] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!accessToken) { setStatus({ state: 'disconnected', oauthAvailable: false }); return; }
    try {
      const res = await fetch('/api/gafcore/vercel-oauth-status', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      const data = (await res.json()) as {
        ok?: boolean; connected?: boolean;
        vercel_username?: string; team_id?: string;
        oauth_available?: boolean;
      };
      if (!res.ok || !data.ok) { setStatus({ state: 'error', message: 'No se pudo verificar Vercel' }); return; }
      if (data.connected && data.vercel_username) {
        setStatus({ state: 'connected', username: data.vercel_username, teamId: data.team_id ?? null });
      } else {
        setStatus({ state: 'disconnected', oauthAvailable: data.oauth_available ?? false });
      }
    } catch { setStatus({ state: 'error', message: 'Error de conexión' }); }
  }, [accessToken]);

  useEffect(() => { void fetchStatus(); }, [fetchStatus]);

  // Detectar retorno del callback OAuth
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('vercel_connected');
    const username = params.get('vercel_username');
    const oauthError = params.get('oauth_error');

    if (connected === '1' && username) {
      toast.success(`¡Vercel conectado como ${username}!`, {
        description: 'Tu proyecto se desplegará en tu cuenta de Vercel.',
      });
      setStatus({ state: 'connected', username, teamId: null });
      onConnected?.(username);
      const clean = new URL(window.location.href);
      clean.searchParams.delete('vercel_connected');
      clean.searchParams.delete('vercel_username');
      window.history.replaceState({}, '', clean.toString());
    }
    if (oauthError) {
      toast.error('Error al conectar Vercel', { description: decodeURIComponent(oauthError) });
      const clean = new URL(window.location.href);
      clean.searchParams.delete('oauth_error');
      window.history.replaceState({}, '', clean.toString());
    }
  }, [onConnected]);

  const handleConnect = () => {
    if (!accessToken) { toast.error('Inicia sesión primero'); return; }
    const redirectTo = window.location.pathname + window.location.search;
    window.location.href = `/api/gafcore/vercel-oauth-start?redirect_to=${encodeURIComponent(redirectTo)}`;
  };

  const handleDisconnect = async () => {
    if (!accessToken) return;
    setDisconnecting(true);
    try {
      const res = await fetch('/api/gafcore/vercel-oauth-status', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        setStatus({ state: 'disconnected', oauthAvailable: true });
        toast.success('Vercel desconectado');
        onDisconnected?.();
      }
    } finally { setDisconnecting(false); }
  };

  if (status.state === 'loading') {
    return (
      <div className={cn('flex items-center gap-2 text-muted-foreground', className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-[12px]">Verificando Vercel…</span>
      </div>
    );
  }

  if (status.state === 'connected') {
    if (compact) {
      return (
        <div className={cn('flex items-center gap-1.5', className)}>
          <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-[11px] text-primary font-medium truncate">{status.username}</span>
          <button type="button" onClick={handleDisconnect} disabled={disconnecting}
            className="ml-1 text-[10px] text-muted-foreground hover:text-destructive">
            {disconnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}
          </button>
        </div>
      );
    }
    return (
      <div className={cn('rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5', className)}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Globe className="h-4 w-4 text-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-foreground">Vercel conectado</p>
              <p className="text-[11px] text-muted-foreground">{status.username}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <Button size="sm" variant="ghost"
              className="h-7 text-[10px] text-muted-foreground hover:text-destructive px-2"
              onClick={handleDisconnect} disabled={disconnecting}>
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

  return (
    <div className={cn('space-y-2', className)}>
      <Button size="sm" className="h-8 w-full gap-2 text-[12px]" onClick={handleConnect}>
        <Globe className="h-4 w-4" />
        Conectar con Vercel
      </Button>
      <p className="text-[10px] text-muted-foreground text-center">
        Tu proyecto se desplegará en <strong>tu cuenta</strong> de Vercel.
      </p>
    </div>
  );
}
