import { useEffect } from "react";

/** Registra el service worker PWA (solo cliente). */
export function GafcorePwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      /* entornos sin SW o scope bloqueado */
    });
  }, []);
  return null;
}
