import { useCallback, useState } from "react";
import { Smartphone, Download, ExternalLink, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getGafcoreMobileDownloadLinks } from "@/lib/gafcore-mobile.shared";
import { GAFCORE_INSTALL_BANNER_DISMISS_KEY } from "@/lib/gafcore-pwa.shared";
import { useGafcoreInstallPrompt } from "@/hooks/useGafcoreInstallPrompt";
import { toast } from "sonner";

export function GafcoreInstallApp({
  className = "",
  variant = "full",
}: {
  className?: string;
  variant?: "full" | "compact";
}) {
  const links = getGafcoreMobileDownloadLinks();
  const {
    installed,
    canInstallAndroid,
    canShowIosGuide,
    installAvailable,
    triggerInstall,
  } = useGafcoreInstallPrompt();

  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(GAFCORE_INSTALL_BANNER_DISMISS_KEY) === "1";
  });
  const [iosModalOpen, setIosModalOpen] = useState(false);

  const onInstallPwa = useCallback(async () => {
    if (canShowIosGuide && !canInstallAndroid) {
      setIosModalOpen(true);
      return;
    }
    const outcome = await triggerInstall();
    if (outcome === "unavailable") {
      toast.message("En Chrome/Edge: menú ⋮ → «Instalar aplicación» o «Añadir a pantalla de inicio».", {
        duration: 8000,
      });
    }
  }, [canShowIosGuide, canInstallAndroid, triggerInstall]);

  const dismissBanner = useCallback(() => {
    setDismissed(true);
    try {
      window.localStorage.setItem(GAFCORE_INSTALL_BANNER_DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  if (installed) return null;
  if (!installAvailable && !links.playStore && !links.appStore && variant === "compact") return null;
  if (variant === "compact" && dismissed) return null;

  const installButton = (
    <Button
      type="button"
      size="sm"
      className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
      onClick={() => void onInstallPwa()}
    >
      <Download className="h-3.5 w-3.5" />
      Instalar App GafCore
    </Button>
  );

  const iosDialog = (
    <Dialog open={iosModalOpen} onOpenChange={setIosModalOpen}>
      <DialogContent className="border-border/80 bg-card sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            Instalar en iPhone / iPad
          </DialogTitle>
          <DialogDescription asChild>
            <p className="text-sm text-muted-foreground">
              Pulsa <Share className="mx-0.5 inline h-4 w-4 text-primary" /> Compartir en Safari y
              elige <strong className="text-foreground">«Añadir a la pantalla de inicio»</strong>.
            </p>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );

  if (variant === "compact") {
    return (
      <>
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
            {installAvailable ? installButton : null}
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
        {iosDialog}
      </>
    );
  }

  return (
    <>
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
            {installAvailable ? installButton : null}
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
      {iosDialog}
    </>
  );
}
