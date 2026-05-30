import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Map, Navigation } from "lucide-react";
import { HealthStatus } from "@/components/HealthStatus";

type MobilityMapProps = {
  /** Simula fallo de tiles para probar HealthStatus */
  simulateFailure?: boolean;
};

export function MobilityMap({ simulateFailure = false }: MobilityMapProps) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [healthPhase, setHealthPhase] = useState<"recalibrating_route" | null>("recalibrating_route");

  useEffect(() => {
    setStatus("loading");
    setHealthPhase(simulateFailure ? "recalibrating_route" : null);

    const timer = window.setTimeout(
      () => {
        if (simulateFailure) {
          setStatus("error");
          setHealthPhase("recalibrating_route");
        } else {
          setStatus("ready");
          setHealthPhase(null);
        }
      },
      simulateFailure ? 1200 : 900,
    );

    return () => window.clearTimeout(timer);
  }, [simulateFailure]);

  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay: 0.08 }}
      className="relative overflow-hidden rounded-3xl border border-[var(--mobility-border)] shadow-2xl"
      aria-label="Mapa del viaje"
    >
      <div className="relative aspect-[16/10] min-h-[220px] bg-[oklch(0.12_0.02_265)]">
        {status === "loading" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="size-10 animate-spin rounded-full border-2 border-[var(--mobility-accent)] border-t-transparent" />
            <p className="text-sm text-[var(--mobility-muted)]">Cargando mapa…</p>
          </div>
        ) : null}

        {status === "ready" ? (
          <>
            <div
              className="absolute inset-0 opacity-40"
              style={{
                backgroundImage: `
                  linear-gradient(oklch(1 0 0 / 0.04) 1px, transparent 1px),
                  linear-gradient(90deg, oklch(1 0 0 / 0.04) 1px, transparent 1px)
                `,
                backgroundSize: "32px 32px",
              }}
            />
            <div className="absolute left-[18%] top-[28%] size-4 rounded-full mobility-accent-gradient shadow-lg ring-4 ring-[var(--mobility-accent)]/30" />
            <div className="absolute right-[22%] bottom-[32%] size-3 rounded-full bg-[oklch(0.96_0.01_265)] shadow-md" />
            <svg className="absolute inset-0 size-full text-[var(--mobility-accent)]/50" aria-hidden>
              <path
                d="M 120 80 Q 200 120 280 90 T 420 140"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeDasharray="8 6"
              />
            </svg>
            <div className="absolute bottom-4 left-4 mobility-glass-panel rounded-2xl px-4 py-2 text-xs">
              <span className="font-medium">Ruta estimada</span>
              <span className="mx-2 text-[var(--mobility-muted)]">·</span>
              <span className="text-[var(--mobility-accent)]">12.4 km · 18 min</span>
            </div>
          </>
        ) : null}

        {status === "error" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[oklch(0.08_0.01_265/0.9)] px-6">
            <Map className="size-10 text-[var(--mobility-muted)]" />
            <p className="text-center text-sm text-[var(--mobility-muted)]">
              No pudimos cargar el mapa. El cerebro GafCore está recalibrando la ruta.
            </p>
            <HealthStatus phase="recalibrating_route" />
          </div>
        ) : null}

        <div className="absolute right-4 top-4 mobility-glass-panel rounded-2xl p-2">
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-xl mobility-accent-gradient text-[oklch(0.1_0_0)]"
            aria-label="Centrar mapa"
          >
            <Navigation className="size-5" />
          </button>
        </div>
      </div>

      {healthPhase && status === "loading" ? (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <HealthStatus phase={healthPhase} />
        </div>
      ) : null}
    </motion.section>
  );
}
