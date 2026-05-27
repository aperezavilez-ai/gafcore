import { useCallback, useEffect, useState } from "react";
import { Smartphone, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getGafcoreMobileDownloadLinks } from "@/lib/gafcore-mobile.shared";
import { toast } from "sonner";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

const INSTALL_BANNER_DISMISS_KEY = "gafcore-install-banner-dismissed";

export function GafcoreInstallApp({
  className = "",
  variant = "full",
}: {
  className?: string;
  variant?: "full" | "compact";
}) {
  const links = getGafcoreMobileDownloadLinks();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(INSTALL_BANNER_DISMISS_KEY) === "1";
  });

  useEffect(() => {
    setInstalled(isStandaloneDisplay());
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  const onInstallPwa = useCallback(async () => {
    if (!deferredPrompt) {
      toast.message("En Chrome/Edge: menú ⋮ → «Instalar aplicación» o «Añadir a pantalla de inicio».", {
        duration: 8000,
      });
      return;
    }
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (choice.outcome === "accepted") setInstalled(true);
  }, [deferredPrompt]);

  const dismissBanner = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(INSTALL_BANNER_DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  if (installed) return null;
  if (variant === "compact" && dismissed) return null;

  if (variant === "compact") {
    return (
      <div
        className={`flex shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-muted/25 px-2 py-1.5 sm:px-3 ${className}`}
        role="region"
        aria-label="Instalar GafCore"
      >
        <p className="min-w-0 truncate text-[11px] text-muted-foreground sm:text-xs">
          <Smartphone className="mr-1 inline h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          Instala GafCore en tu móvil o escritorio
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" size="sm" variant="secondary" className="h-7 px-2 text-[11px]" onClick={() => void onInstallPwa()}>
            <Download className="mr-1 h-3 w-3" />
            Instalar
          </Button>
          {links.playStore ? (
            <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-[11px]">
              <a href={links.playStore} target="_blank" rel="noopener noreferrer" title="Google Play">
                Play
              </a>
            </Button>
          ) : null}
          {links.appStore ? (
            <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-[11px]">
              <a href={links.appStore} target="_blank" rel="noopener noreferrer" title="App Store">
                iOS
              </a>
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={dismissBanner} aria-label="Ocultar aviso">
            ×
          </Button>
        </div>
      </div>
    );
  }

  return (
    <section
      className={`rounded-2xl border border-border/60 bg-muted/20 p-5 sm:p-6 ${className}`}
      aria-labelledby="gafcore-install-heading"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-primary">
            <Smartphone className="h-5 w-5 shrink-0" />
            <h2 id="gafcore-install-heading" className="text-base font-semibold text-foreground">
              Descarga GafCore en cualquier dispositivo
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Usa la app en el navegador, instálala como PWA o descárgala desde las tiendas cuando estén
            publicadas.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {deferredPrompt || links.pwaHint ? (
            <Button type="button" size="sm" className="gap-1.5" onClick={() => void onInstallPwa()}>
              <Download className="h-4 w-4" />
              Instalar app (PWA)
            </Button>
          ) : null}
          {links.playStore ? (
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <a href={links.playStore} target="_blank" rel="noopener noreferrer">
                Google Play
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          ) : null}
          {links.appStore ? (
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <a href={links.appStore} target="_blank" rel="noopener noreferrer">
                App Store
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          ) : null}
        </div>
      </div>
      {!links.playStore && !links.appStore ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Tiendas: próximamente. Mientras tanto, instala desde el navegador o usa{" "}
          <a href={links.webApp} className="text-primary underline-offset-2 hover:underline">
            gafcore.com en el móvil
          </a>
          .
        </p>
      ) : null}
    </section>
  );
}
