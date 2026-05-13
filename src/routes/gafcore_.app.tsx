import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Lock, ArrowRight, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { GafCoreIDE } from "@/components/gafcore/GafCoreIDE";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useServerFn } from "@tanstack/react-start";
import { assignGafcoreAccountType } from "@/lib/gafcore-roles.functions";

export const Route = createFileRoute("/gafcore_/app")({
  component: GafCoreAppPage,
  head: () => ({ meta: [{ title: "Plataforma — GafCore" }] }),
});

function GafCoreAppPage() {
  const { user, loading: authLoading } = useAuth();
  const assignUserWelcome = useServerFn(assignGafcoreAccountType);
  // Reintento defensivo: tras un login con full reload, getSession puede tardar
  // unos ms en hidratar desde localStorage. Hasta confirmar, mostramos loader.
  const [graceChecking, setGraceChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  /** Asegura créditos de bienvenida si el backend los dejó en 0 (p. ej. cuenta ya existía). */
  useEffect(() => {
    if (authLoading || graceChecking) return;
    if (!user?.id && !hasSession) return;
    void (async () => {
      const id = user?.id ?? (await supabase.auth.getSession()).data.session?.user?.id;
      if (!id) return;
      const k = `gafcore_welcome_sync_v1_${id}`;
      if (typeof window !== "undefined" && sessionStorage.getItem(k)) return;
      if (typeof window !== "undefined") sessionStorage.setItem(k, "1");
      try {
        await assignUserWelcome({ data: { accountType: "user" } });
      } catch {
        if (typeof window !== "undefined") sessionStorage.removeItem(k);
      }
    })();
  }, [authLoading, graceChecking, user?.id, hasSession, assignUserWelcome]);

  useEffect(() => {
    if (authLoading) return;
    if (user) {
      setHasSession(true);
      setGraceChecking(false);
      return;
    }
    let cancelled = false;
    (async () => {
      for (let i = 0; i < 20; i++) {
        if (cancelled) return;
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) {
          if (!cancelled) {
            setHasSession(true);
            setGraceChecking(false);
          }
          return;
        }
        await new Promise((r) => setTimeout(r, 120));
      }
      if (!cancelled) setGraceChecking(false);
    })();
    return () => { cancelled = true; };
  }, [authLoading, user]);

  if (authLoading || graceChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Verificando acceso seguro…</p>
        </div>
      </div>
    );
  }

  if (!user && !hasSession) {
    return (
      <AccessMessage
        title="Entrar a GafCore"
        message="Usa tu cuenta para acceder a la plataforma."
        primaryLabel="Entrar"
        primaryTo="/gafcore/login"
      />
    );
  }

  return (
    <ErrorBoundary>
      <GafCoreIDE />
    </ErrorBoundary>
  );
}

function AccessMessage({
  title,
  message,
  primaryLabel,
  primaryTo,
}: {
  title: string;
  message: string;
  primaryLabel: string;
  primaryTo: "/gafcore/login";
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-sm text-muted-foreground">{message}</p>
        <Button asChild className="w-full">
          <Link
            to={primaryTo}
            search={primaryTo === "/gafcore/login" ? { redirect: "/gafcore/app" } : undefined}
          >
            {primaryLabel}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
        <Button asChild variant="ghost" className="mt-3 w-full">
          <Link to="/gafcore">
            <Home className="mr-2 h-4 w-4" />
            Volver al inicio
          </Link>
        </Button>
      </div>
    </div>
  );
}
