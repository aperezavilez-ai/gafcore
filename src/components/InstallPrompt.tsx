import { useCallback, useEffect, useState } from "react";
import { Download, Share, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useGafcoreInstallPrompt } from "@/hooks/useGafcoreInstallPrompt";
import {
  GAFCORE_INSTALL_FLOAT_DISMISS_KEY,
  isMobileViewport,
} from "@/lib/gafcore-pwa.shared";

/**
 * Botón flotante discreto (móvil) para instalar PWA en Android o guía en iOS Safari.
 * No interfiere con el IDE en escritorio ni cuando ya está instalada.
 */
export function InstallPrompt() {
  const {
    installAvailable,
    canInstallAndroid,
    canShowIosGuide,
    triggerInstall,
  } = useGafcoreInstallPrompt();

  const [showFloat, setShowFloat] = useState(false);
  const [iosModalOpen, setIosModalOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(GAFCORE_INSTALL_FLOAT_DISMISS_KEY) === "1";
  });

  useEffect(() => {
    if (dismissed || !installAvailable) {
      setShowFloat(false);
      return;
    }
    const update = () => setShowFloat(isMobileViewport());
    update();
    const mq = window.matchMedia("(max-width: 768px)");
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [dismissed, installAvailable]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    setShowFloat(false);
    try {
      window.localStorage.setItem(GAFCORE_INSTALL_FLOAT_DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  const onAndroidInstall = useCallback(async () => {
    const outcome = await triggerInstall();
    if (outcome === "accepted") dismiss();
  }, [triggerInstall, dismiss]);

  const onTap = useCallback(() => {
    if (canShowIosGuide && !canInstallAndroid) {
      setIosModalOpen(true);
      return;
    }
    void onAndroidInstall();
  }, [canShowIosGuide, canInstallAndroid, onAndroidInstall]);

  if (!installAvailable && !iosModalOpen) return null;

  return (
    <>
      {showFloat ? (
        <div
          className="fixed bottom-4 left-4 right-4 z-40 flex items-center gap-2 md:hidden"
          role="region"
          aria-label="Instalar GafCore"
        >
          <Button
            type="button"
            className="h-11 flex-1 gap-2 rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:bg-primary/90"
            onClick={onTap}
          >
            <Download className="h-4 w-4 shrink-0" />
            Instalar App GafCore
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-xl border border-border/80 bg-card/95 backdrop-blur-sm"
            onClick={dismiss}
            aria-label="Ocultar aviso de instalación"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      <Dialog open={iosModalOpen} onOpenChange={setIosModalOpen}>
        <DialogContent className="border-border/80 bg-card sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              Instalar en iPhone / iPad
            </DialogTitle>
            <DialogDescription asChild>
              <ol className="mt-3 space-y-3 text-left text-sm text-muted-foreground">
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                    1
                  </span>
                  <span>
                    Pulsa el botón <Share className="mx-0.5 inline h-4 w-4 text-primary" />{" "}
                    <strong className="text-foreground">Compartir</strong> en la barra de Safari.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                    2
                  </span>
                  <span>
                    Elige <strong className="text-foreground">«Añadir a la pantalla de inicio»</strong>.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                    3
                  </span>
                  <span>
                    Confirma con <strong className="text-foreground">Añadir</strong>. GafCore se abrirá a
                    pantalla completa.
                  </span>
                </li>
              </ol>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
}
