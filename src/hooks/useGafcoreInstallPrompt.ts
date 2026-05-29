import { useCallback, useEffect, useState } from "react";
import {
  type BeforeInstallPromptEvent,
  isIosSafari,
  isStandalonePwaDisplay,
} from "@/lib/gafcore-pwa.shared";

export function useGafcoreInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [iosSafari, setIosSafari] = useState(false);

  useEffect(() => {
    setInstalled(isStandalonePwaDisplay());
    setIosSafari(isIosSafari());

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  const canInstallAndroid = Boolean(deferredPrompt);
  const canShowIosGuide = iosSafari && !installed;
  const installAvailable = !installed && (canInstallAndroid || canShowIosGuide);

  const triggerInstall = useCallback(async (): Promise<"accepted" | "dismissed" | "unavailable"> => {
    if (!deferredPrompt) return "unavailable";
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (choice.outcome === "accepted") setInstalled(true);
    return choice.outcome;
  }, [deferredPrompt]);

  return {
    installed,
    deferredPrompt,
    iosSafari,
    canInstallAndroid,
    canShowIosGuide,
    installAvailable,
    triggerInstall,
  };
}
