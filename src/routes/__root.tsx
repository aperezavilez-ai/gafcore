import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  buildGafcoreJsonLd,
  buildGafcoreSeoMeta,
  gafcoreSeoHeadLinks,
} from "@/lib/gafcore-seo.shared";
import {
  GAFCORE_APPLE_TOUCH_ICON_PATH,
  GAFCORE_FAVICON_INLINE,
  GAFCORE_FAVICON_PATH,
  GAFCORE_FAVICON_SVG_PATH,
  gafcoreHeadIconLinks,
  gafcorePwaMetaTags,
} from "@/lib/site-icons.shared";
import { I18nProvider } from "@/i18n/I18nProvider";
import { ClientOnly } from "@/components/ClientOnly";
import { ClientRootWidgets } from "@/components/ClientRootWidgets";
import { GafcorePwaRegister } from "@/components/GafcorePwaRegister";
import { InstallPrompt } from "@/components/InstallPrompt";
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
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
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
        ...gafcorePwaMetaTags(),
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
        <link rel="icon" href={GAFCORE_FAVICON_INLINE} />
        <link rel="shortcut icon" href={GAFCORE_FAVICON_INLINE} />
        <link rel="icon" type="image/svg+xml" href={GAFCORE_FAVICON_SVG_PATH} />
        <link rel="icon" type="image/png" sizes="32x32" href={GAFCORE_FAVICON_PATH} />
        <link rel="apple-touch-icon" href={GAFCORE_APPLE_TOUCH_ICON_PATH} />
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
        <GafcorePwaRegister />
        <InstallPrompt />
        <ClientRootWidgets />
      </ClientOnly>
    </I18nProvider>
  );
}

function MobileViewportGuard() {
  useEffect(() => {
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
