import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  buildGafcoreJsonLd,
  buildGafcoreSeoMeta,
  gafcoreSeoHeadLinks,
} from "@/lib/gafcore-seo.shared";
import {
  GAFCORE_FAVICON_INLINE,
  GAFCORE_FAVICON_PATH,
  GAFCORE_FAVICON_SVG_PATH,
  gafcoreHeadIconLinks,
} from "@/lib/site-icons.shared";
import { GAFCORE_WEB_ONLY_HEAD_SCRIPT } from "@/lib/gafcore-web-only.shared";
import { I18nProvider } from "@/i18n/I18nProvider";
import { ClientOnly } from "@/components/ClientOnly";
import { ClientRootWidgets } from "@/components/ClientRootWidgets";
import { GafcoreWebOnly } from "@/components/GafcoreWebOnly";
import {
  GAFCORE_LOGIN_URL_STRIP_SCRIPT,
  stripSecretsFromLoginUrl,
} from "@/lib/gafcore-login.shared";
import { GAFCORE_PWA_THEME_COLOR } from "@/lib/gafcore-pwa.shared";
import { installServerFnAuth } from "@/lib/server-fn-auth";

if (typeof window !== "undefined") {
  installServerFnAuth();
}

// Side-effect import: Start manifest gestiona el CSS en SSR (evita hash distinto
// client/server en Linux/Vercel con `?url`, que provoca HTTPError 500).
import "../styles.css";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="text-8xl font-bold text-primary/20 select-none">404</p>
        <h1 className="mt-2 text-2xl font-bold text-foreground">Página no encontrada</h1>
        <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
          Esta página no existe o fue movida. Si crees que es un error,
          escríbenos a{" "}
          <a href="mailto:soporte@gafcore.com" className="text-primary hover:underline">
            soporte@gafcore.com
          </a>
          .
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/gafcore"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Ir a GafCore
          </Link>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Inicio
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => {
    const jsonLd = buildGafcoreJsonLd();
    return {
      meta: [
        ...buildGafcoreSeoMeta(),
        { name: "theme-color", content: GAFCORE_PWA_THEME_COLOR },
        { name: "mobile-web-app-capable", content: "no" },
      ],
      links: [...gafcoreSeoHeadLinks(), ...gafcoreHeadIconLinks()],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(jsonLd),
        },
      ],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: GAFCORE_LOGIN_URL_STRIP_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: GAFCORE_WEB_ONLY_HEAD_SCRIPT }} />
        <link rel="icon" href={GAFCORE_FAVICON_INLINE} />
        <link rel="shortcut icon" href={GAFCORE_FAVICON_INLINE} />
        <link rel="icon" type="image/svg+xml" href={GAFCORE_FAVICON_SVG_PATH} />
        <link rel="icon" type="image/png" sizes="32x32" href={GAFCORE_FAVICON_PATH} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <I18nProvider>
      <MobileViewportGuard />
      <Outlet />
      <ClientOnly>
        <GafcoreWebOnly />
        <ClientRootWidgets />
      </ClientOnly>
    </I18nProvider>
  );
}

function MobileViewportGuard() {
  useEffect(() => {
    stripSecretsFromLoginUrl();
    const resetHorizontalScroll = () => {
      document.documentElement.scrollLeft = 0;
      document.body.scrollLeft = 0;
      window.scrollTo(0, window.scrollY);
    };

    const scheduleReset = () => {
      resetHorizontalScroll();
      window.requestAnimationFrame(resetHorizontalScroll);
      window.setTimeout(resetHorizontalScroll, 250);
    };

    scheduleReset();
    window.addEventListener("resize", scheduleReset);
    window.addEventListener("orientationchange", scheduleReset);
    window.addEventListener("pageshow", scheduleReset);

    return () => {
      window.removeEventListener("resize", scheduleReset);
      window.removeEventListener("orientationchange", scheduleReset);
      window.removeEventListener("pageshow", scheduleReset);
    };
  }, []);

  return null;
}
