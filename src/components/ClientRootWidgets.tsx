import { useEffect, useState, type ReactNode } from "react";

/**
 * Widgets solo cliente: import() dinámico evita cargar react-markdown/sonner en el bundle SSR de __root.
 */
export function ClientRootWidgets() {
  const [widgets, setWidgets] = useState<ReactNode>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      import("@/components/ui/sonner"),
      import("@/components/AIChatWidget"),
    ]).then(([sonner, chat]) => {
      if (cancelled) return;
      const Toaster = sonner.Toaster;
      const AIChatWidget = chat.AIChatWidget;
      setWidgets(
        <>
          <Toaster richColors position="top-right" />
          <AIChatWidget />
        </>,
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return widgets;
}
