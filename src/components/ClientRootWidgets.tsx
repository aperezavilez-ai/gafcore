import { useEffect, useState, type ReactNode } from "react";

/**
 * Widgets solo cliente: import() dinámico evita cargar react-markdown/sonner en el bundle SSR de __root.
 */
/** Sin chat flotante en auth/landing — menos JS y nada encima de los clics en móvil. */
function skipGafcoreChatWidget(): boolean {
  if (typeof window === "undefined") return false;
  const p = window.location.pathname;
  if (p.includes("/gafcore/login") || p.includes("/gafcore/register")) return true;
  if (p === "/gafcore" || p === "/gafcore/") return true;
  return false;
}

export function ClientRootWidgets() {
  const [widgets, setWidgets] = useState<ReactNode>(null);

  useEffect(() => {
    let cancelled = false;
    const onAuthScreen = skipGafcoreChatWidget();
    void import("@/components/ui/sonner").then((sonner) => {
      if (cancelled) return;
      const Toaster = sonner.Toaster;
      if (onAuthScreen) {
        setWidgets(<Toaster richColors position="top-right" />);
        return;
      }
      void import("@/components/AIChatWidget").then((chat) => {
        if (cancelled) return;
        const AIChatWidget = chat.AIChatWidget;
        setWidgets(
          <>
            <Toaster richColors position="top-right" />
            <AIChatWidget />
          </>,
        );
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return widgets;
}
