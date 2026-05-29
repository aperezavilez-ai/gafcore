/** PWA — constantes y helpers compartidos (sin side effects). */

export const GAFCORE_PWA_THEME_COLOR = "#0B0914";
export const GAFCORE_PWA_BACKGROUND_COLOR = "#0B0914";

export const GAFCORE_INSTALL_FLOAT_DISMISS_KEY = "gafcore-install-float-dismissed";
export const GAFCORE_INSTALL_BANNER_DISMISS_KEY = "gafcore-install-banner-dismissed";

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function isStandalonePwaDisplay(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone/iPad Safari (no Chrome iOS para evitar confusión con BIP). */
export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!isIOS) return false;
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

export function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 768px)").matches;
}
