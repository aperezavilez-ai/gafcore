import { useEffect } from "react";

const RELOAD_FLAG = "gafcore-web-only-reloaded";

/**
 * GafCore solo web: desregistra service workers y cachés PWA antiguos
 * para que Chrome deje de mostrar «Abrir en la app».
 *
 * Un service worker ya instalado en el navegador del usuario sigue
 * controlando la página (intercepta fetch y sirve chunks viejos en caché)
 * hasta que se recarga DESPUÉS de desregistrarlo — unregister() no lo
 * suelta de inmediato. Por eso, si había un SW activo, forzamos una única
 * recarga (guardada en sessionStorage para no hacer loop) para que el
 * usuario quede en la versión limpia sin tener que limpiar caché a mano.
 */
export function GafcoreWebOnly() {
  useEffect(() => {
    void (async () => {
      document.querySelectorAll('link[rel="manifest"]').forEach((el) => el.remove());
      // El controller (no getRegistrations) es la señal correcta de que ESTA
      // carga de página sigue siendo servida por un SW viejo — persiste
      // aunque unregister() ya se haya llamado antes (p. ej. en el script
      // síncrono del <head>).
      const isControlledByWorker =
        "serviceWorker" in navigator && navigator.serviceWorker.controller !== null;
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
      if (isControlledByWorker && !window.sessionStorage.getItem(RELOAD_FLAG)) {
        window.sessionStorage.setItem(RELOAD_FLAG, "1");
        window.location.reload();
      }
    })();
  }, []);
  return null;
}
