import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import { getPublicSiteOrigin } from "@/lib/public-site-url";
import {
  GAFCORE_APPLE_TOUCH_ICON_PATH,
  GAFCORE_FAVICON_PATH,
  gafcoreHeadIconLinks,
} from "@/lib/site-icons.shared";
import { I18nProvider } from "@/i18n/I18nProvider";
import { ClientOnly } from "@/components/ClientOnly";
import { ClientRootWidgets } from "@/components/ClientRootWidgets";
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
    const site = getPublicSiteOrigin();
    return {
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "GafCore — Plataforma de creación con IA" },
      { name: "description", content: "GafCore: crea apps y prototipos con chat, preview en vivo y editor integrado." },
      { name: "author", content: "GafCore" },
      { property: "og:title", content: "GafCore — Plataforma de creación con IA" },
      { property: "og:description", content: "GafCore: crea apps y prototipos con chat, preview en vivo y editor integrado." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: site },
      { property: "og:site_name", content: "GafCore" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "GafCore — Plataforma de creación con IA" },
      { name: "twitter:description", content: "GafCore: crea apps y prototipos con chat, preview en vivo y editor integrado." },
      { property: "og:image", content: `${site}/og-image.png` },
      { name: "twitter:image", content: `${site}/og-image.png` },
      { name: "theme-color", content: "#6366f1" },
    ],
    links: [{ rel: "canonical", href: site }, ...gafcoreHeadIconLinks()],
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
        <link rel="icon" type="image/png" href={GAFCORE_FAVICON_PATH} />
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
