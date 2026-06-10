import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Loader2, Lock, ArrowRight, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useAuth,
  forceAuthLoadingComplete,
  hydrateAuthFromStorage,
  initAuthOnce,
} from "@/hooks/useAuth";
import { DevPortBanner } from "@/components/gafcore/DevPortBanner";
import { getGafcoreSupabaseBrowser } from "@/lib/gafcore-supabase-browser";
import { buildGafcoreSeoMeta } from "@/lib/gafcore-seo.shared";
import { GafCoreBuilderShell } from "@/components/GafCoreBuilderShell";
import { GafCoreOnboarding, markGafcoreOnboardingDone } from "@/components/gafcore/GafCoreOnboarding";
import { useProfile } from "@/hooks/useProfile";
import { useSubscription } from "@/hooks/useSubscription";
import {
  GAFCORE_ADMIN_VIEW_CHANGE_EVENT,
  readGafcoreAdminBuilderView,
  setGafcoreAdminBuilderView,
} from "@/lib/gafcore-admin-builder-view.shared";

const GafCoreIDE = lazy(() =>
  import("@/components/gafcore/GafCoreIDE").then((m) => ({ default: m.GafCoreIDE })),
);
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useServerFn } from "@tanstack/react-start";
import { assignGafcoreAccountType } from "@/lib/gafcore-roles.functions";
import { clearPlanChoicePending } from "@/lib/gafcore-plan-choice";

/** Máximo tiempo mostrando «Verificando acceso…» antes de fallback de sesión. */
const APP_BOOT_MAX_MS = 4_000;

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
  const assignUserWelcome = useServerFn(assignGafcoreAccountType);

  const [bootDone, setBootDone] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [planReady, setPlanReady] = useState(false);
  const welcomeSyncStartedRef = useRef(false);

  const sessionKnown = Boolean(user?.id) || hasSession;
  const showBootScreen = !bootDone;

  useEffect(() => {
    let cancelled = false;

    let bootFinished = false;
    const finishBoot = (session: boolean) => {
      if (cancelled || bootFinished) return;
      bootFinished = true;
      forceAuthLoadingComplete();
      setHasSession(session);
      setBootDone(true);
    };

    void (async () => {
      try {
        await initAuthOnce();
        const sb = await getGafcoreSupabaseBrowser();
        const { data } = await sb.auth.getSession();
        if (data.session?.user) {
          finishBoot(true);
          return;
        }
        const hydrated = await hydrateAuthFromStorage(2_500);
        if (hydrated) {
          finishBoot(true);
          return;
        }
        finishBoot(false);
      } catch {
        finishBoot(false);
      }
    })();

    const cap = window.setTimeout(() => {
      if (cancelled || bootFinished) return;
      void (async () => {
        try {
          await initAuthOnce();
          const sb = await getGafcoreSupabaseBrowser();
          const { data } = await sb.auth.getSession();
          finishBoot(Boolean(data.session?.user));
        } catch {
          finishBoot(false);
        }
      })();
    }, APP_BOOT_MAX_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(cap);
    };
  }, []);

  useEffect(() => {
    if (user?.id) setHasSession(true);
  }, [user?.id]);

  useEffect(() => {
    if (!bootDone || welcomeSyncStartedRef.current) return;
    if (!sessionKnown) return;
    welcomeSyncStartedRef.current = true;
    void (async () => {
      const sb = await getGafcoreSupabaseBrowser();
      const id = user?.id ?? (await sb.auth.getSession()).data.session?.user?.id;
      if (!id) return;
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
  }, [bootDone, sessionKnown, user?.id, assignUserWelcome]);

  useEffect(() => {
    if (!bootDone || !sessionKnown) {
      setPlanReady(false);
      return;
    }
    setPlanReady(true);
    void (async () => {
      try {
        const sb = await getGafcoreSupabaseBrowser();
        const uid = user?.id ?? (await sb.auth.getSession()).data.session?.user?.id;
        if (uid) clearPlanChoicePending(uid);
      } catch {
        /* */
      }
    })();
  }, [bootDone, sessionKnown, user?.id]);

  if (showBootScreen) {
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <DevPortBanner />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
          <p className="text-sm text-muted-foreground">Cargando GafCore…</p>
        </div>
      </div>
    );
  }

  if (!sessionKnown) {
    if (authLoading) {
      return (
        <div className="flex min-h-screen flex-col bg-background text-foreground">
          <DevPortBanner />
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
            <p className="text-sm text-muted-foreground">Verificando sesión…</p>
          </div>
        </div>
      );
    }
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

  if (!planReady) {
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <DevPortBanner />
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
          <p className="text-sm text-muted-foreground">Cargando editor…</p>
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
        <GafCoreIDEWithShell user={user} />
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

// Panel creador (GafCoreIDE) por defecto. IA Builder solo para admins vía toggle.
function GafCoreIDEWithShell({
  user,
}: {
  user: {
    id?: string;
    email?: string | null;
    user_metadata?: Record<string, unknown>;
  } | null | undefined;
}) {
  const { user: authUser } = useAuth();
  const userId = user?.id ?? authUser?.id;
  const { isAdmin, loading: subLoading } = useSubscription(userId);
  const [adminBuilderView, setAdminBuilderView] = useState(readGafcoreAdminBuilderView);
  const { profile, loading: profileLoading, updateProfile } = useProfile(userId);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  useEffect(() => {
    const sync = () => setAdminBuilderView(readGafcoreAdminBuilderView());
    window.addEventListener(GAFCORE_ADMIN_VIEW_CHANGE_EVENT, sync);
    return () => window.removeEventListener(GAFCORE_ADMIN_VIEW_CHANGE_EVENT, sync);
  }, []);

  useEffect(() => {
    if (subLoading || isAdmin) return;
    if (!adminBuilderView) return;
    setGafcoreAdminBuilderView(false);
    setAdminBuilderView(false);
  }, [isAdmin, subLoading, adminBuilderView]);

  // Mostrar onboarding para usuarios normales si no lo han completado
  useEffect(() => {
    if (profileLoading || isAdmin) return;
    const done = profile?.onboarding_completed === true;
    if (!done) setOnboardingOpen(true);
  }, [profile, profileLoading, isAdmin]);

  const userName =
    (user?.user_metadata?.["full_name"] as string | undefined) ??
    (user?.user_metadata?.["name"] as string | undefined) ??
    user?.email?.split("@")[0] ??
    undefined;

  const showAdminBuilder = isAdmin && !subLoading && adminBuilderView;

  if (showAdminBuilder) {
    return (
      <GafCoreBuilderShell
        userName={userName}
        onStart={(prompt) => {
          try {
            sessionStorage.setItem("gafcore_initial_prompt", prompt);
          } catch {
            /* ignore */
          }
          setGafcoreAdminBuilderView(false);
          setAdminBuilderView(false);
        }}
        onExitToCreator={() => {
          setGafcoreAdminBuilderView(false);
          setAdminBuilderView(false);
        }}
      />
    );
  }

  return (
    <>
      <GafCoreOnboarding
        open={onboardingOpen}
        onComplete={(prompt) => {
          markGafcoreOnboardingDone();
          void updateProfile({ onboarding_completed: true }).catch(() => {});
          setOnboardingOpen(false);
          try {
            sessionStorage.setItem("gafcore_initial_prompt", prompt);
          } catch {}
          // Disparar apertura del dialog de nuevo proyecto via evento
          window.setTimeout(() => {
            window.dispatchEvent(new Event("gafcore:open-new-project"));
          }, 100);
        }}
        onSkip={() => {
          markGafcoreOnboardingDone();
          void updateProfile({ onboarding_completed: true }).catch(() => {});
          setOnboardingOpen(false);
        }}
      />
      <GafCoreIDE />
    </>
  );
}
