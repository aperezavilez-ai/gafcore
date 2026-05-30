import { useEffect } from "react";

/**
 * GafCore solo web: desregistra service workers y cachés PWA antiguos
 * para que Chrome deje de mostrar «Abrir en la app».
 */
export function GafcoreWebOnly() {
  useEffect(() => {
    void (async () => {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(
          keys.filter((k) => k.startsWith("gafcore")).map((k) => caches.delete(k)),
        );
      }
    })();
  }, []);
  return null;
}
