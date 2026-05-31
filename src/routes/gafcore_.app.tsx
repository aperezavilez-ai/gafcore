import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Loader2, Lock, ArrowRight, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth, forceAuthLoadingComplete, hydrateAuthFromStorage } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { DevPortBanner } from "@/components/gafcore/DevPortBanner";
import { getGafcoreSupabaseBrowser } from "@/lib/gafcore-supabase-browser";
import { buildGafcoreSeoMeta } from "@/lib/gafcore-seo.shared";

const GafCoreIDE = lazy(() =>
  import("@/components/gafcore/GafCoreIDE").then((m) => ({ default: m.GafCoreIDE })),
);
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useServerFn } from "@tanstack/react-start";
import { assignGafcoreAccountType } from "@/lib/gafcore-roles.functions";
import { clearPlanChoicePending } from "@/lib/gafcore-plan-choice";

export const Route = createFileRoute("/gafcore_/app")({
  component: GafCoreAppPage,
  head: () => ({
    meta: buildGafcoreSeoMeta({
      title: "Plataforma — GafCore",
      description: "Editor y chat con IA — sesión privada.",
      noindex: true,
    }),
  }),
});

function GafCoreAppPage() {
  const { user, loading: authLoading } = useAuth();
  const { loading: roleLoading } = useSubscription(user?.id);
  const assignUserWelcome = useServerFn(assignGafcoreAccountType);
  // Reintento defensivo: tras un login con full reload, getSession puede tardar
  // unos ms en hidratar desde localStorage. Hasta confirmar, mostramos loader.
  const [graceChecking, setGraceChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  /** Tras auth: comprobar si debe ir a elegir plan antes de montar el IDE. */
  const [planGateChecked, setPlanGateChecked] = useState(false);
  const [authSlow, setAuthSlow] = useState(false);
  const [forceContinue, setForceContinue] = useState(false);
  const roleReadyOnceRef = useRef(false);
  const welcomeSyncStartedRef = useRef(false);

  if (!roleLoading) roleReadyOnceRef.current = true;

  const accessPending =
    !forceContinue &&
    (authLoading || graceChecking || (roleLoading && !roleReadyOnceRef.current));

  /** Asegura créditos de bienvenida si el backend los dejó en 0 (p. ej. cuenta ya existía). */
  useEffect(() => {
    if (authLoading || graceChecking || welcomeSyncStartedRef.current) return;
    if (!user?.id && !hasSession) return;
    welcomeSyncStartedRef.current = true;
    void (async () => {
      const sb = await getGafcoreSupabaseBrowser();
      const id = user?.id ?? (await sb.auth.getSession()).data.session?.user?.id;
      if (!id) return;
      if (typeof window !== "undefined") {
        sessionStorage.removeItem(`gafcore_welcome_sync_v2_${id}`);
      }
      const k = `gafcore_welcome_sync_v3_${id}`;
      if (typeof window !== "undefined" && sessionStorage.getItem(k)) return;
      try {
        await assignUserWelcome({ data: { accountType: "user" } });
        if (typeof window !== "undefined") {
          sessionStorage.setItem(k, "1");
          window.dispatchEvent(new Event("gafcore:credits-refresh"));
        }
      } catch {
        /* reintento en la próxima visita */
      }
    })();
  }, [authLoading, graceChecking, user?.id, hasSession]);

  useEffect(() => {
    if (!accessPending) {
      setAuthSlow(false);
      return;
    }
    const t = window.setTimeout(() => setAuthSlow(true), 8_000);
    return () => window.clearTimeout(t);
  }, [accessPending]);

  useEffect(() => {
    if (!authLoading && !user) {
      void hydrateAuthFromStorage(3_000);
    }
  }, [authLoading, user]);

  useEffect(() => {
    if (authLoading) return;
    if (user) {
      setHasSession(true);
      setGraceChecking(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const sb = await getGafcoreSupabaseBrowser();
      for (let i = 0; i < 20; i++) {
        if (cancelled) return;
        const { data } = await sb.auth.getSession();
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

  /** En /gafcore/app no redirigir a landing (evita parpadeo). Solo limpiar bloqueo de plan si ya hay sesión. */
  useEffect(() => {
    if (authLoading || graceChecking) return;
    if (!user?.id && !hasSession) {
      setPlanGateChecked(false);
      return;
    }
    void (async () => {
      const sb = await getGafcoreSupabaseBrowser();
      const uid = user?.id ?? (await sb.auth.getSession()).data.session?.user?.id;
      if (uid) clearPlanChoicePending(uid);
      setPlanGateChecked(true);
    })();
  }, [authLoading, graceChecking, user?.id, hasSession]);

  if (accessPending) {
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <DevPortBanner />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Verificando acceso seguro…</p>
          {authSlow ? (
            <div className="mt-2 flex max-w-sm flex-col items-center gap-2 text-center">
              <p className="text-xs text-muted-foreground">
                Tardando más de lo habitual. Puedes entrar manualmente o comprobar tu conexión.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  forceAuthLoadingComplete();
                  setGraceChecking(false);
                  setForceContinue(true);
                }}
              >
                Continuar sin esperar
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (!user && !hasSession) {
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <DevPortBanner />
        <AccessMessage
          title="Entrar a GafCore"
          message="Usa tu cuenta para acceder a la plataforma."
          primaryLabel="Entrar"
          primaryTo="/gafcore/login"
        />
      </div>
    );
  }

  if (!planGateChecked) {
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <DevPortBanner />
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Preparando tu espacio…</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <DevPortBanner />
      <Suspense
        fallback={
          <div className="flex min-h-[50vh] flex-1 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
          </div>
        }
      >
        <GafCoreIDE />
      </Suspense>
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
    <div className="flex flex-1 items-center justify-center px-4">
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
