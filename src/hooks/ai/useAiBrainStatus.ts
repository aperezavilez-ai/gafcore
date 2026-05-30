import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import type { AiBrainCapabilities } from "@/services/ai/types.shared";
import { getGafcoreBrainCapabilities } from "@/lib/gafcore-brain.functions";

/**
 * Estado del Cerebro Central para la UI (sin SDKs en cliente).
 * Las llamadas de chat siguen en `/api/gafcore/chat/*` y server functions existentes.
 */
export function useAiBrainStatus() {
  const fetchCapabilities = useServerFn(getGafcoreBrainCapabilities);
  const [capabilities, setCapabilities] = useState<AiBrainCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchCapabilities();
        if (!cancelled) {
          setCapabilities(data as AiBrainCapabilities);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "No se pudo cargar el estado del cerebro");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchCapabilities]);

  return { capabilities, loading, error, aiReady: capabilities?.aiReady ?? false };
}
