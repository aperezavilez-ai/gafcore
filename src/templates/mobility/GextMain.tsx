import { useState } from "react";
import { motion } from "framer-motion";
import { Car } from "lucide-react";
import "./mobility-theme.css";
import { DestinationSearch } from "@/templates/mobility/components/DestinationSearch";
import { CategoryPicker, type RideTier } from "@/templates/mobility/components/CategoryPicker";
import { MobilityMap } from "@/templates/mobility/components/MobilityMap";

export type GextMainProps = {
  /** Forzar fallo de mapa (demo QA / HealthStatus) */
  demoMapFailure?: boolean;
};

/**
 * Plantilla maestra Movilidad — transporte premium dark + acento naranja.
 * Golden example alineado con BASE_DESIGN_SYSTEM (glass, rounded-3xl, motion).
 */
export function GextMain({ demoMapFailure = false }: GextMainProps) {
  const [destination, setDestination] = useState("");
  const [tier, setTier] = useState<RideTier>("VIP");
  const [mapFails, setMapFails] = useState(demoMapFailure);

  return (
    <div className="mobility-shell min-h-screen">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 top-20 size-[420px] rounded-full bg-[var(--mobility-accent)] opacity-20 blur-3xl" />
        <div className="absolute -right-24 bottom-0 size-[360px] rounded-full bg-[oklch(0.4_0.08_265)] opacity-40 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <motion.header
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-4">
            <div className="inline-flex size-14 items-center justify-center rounded-3xl mobility-accent-gradient shadow-xl">
              <Car className="size-7 text-[oklch(0.1_0_0)]" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--mobility-accent)]">
                Gext Mobility
              </p>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Tu viaje, <span className="text-[var(--mobility-accent)]">elevado</span>
              </h1>
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-full border border-[var(--mobility-border)] px-4 py-2 text-xs text-[var(--mobility-muted)]">
            <input
              type="checkbox"
              checked={mapFails}
              onChange={(e) => setMapFails(e.target.checked)}
              className="accent-[var(--mobility-accent)]"
            />
            Simular fallo de mapa (QA)
          </label>
        </motion.header>

        <div className="space-y-8">
          <DestinationSearch
            value={destination}
            onChange={setDestination}
            onSubmit={() => setMapFails(false)}
          />

          <MobilityMap simulateFailure={mapFails} />

          <section>
            <motion.h2
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--mobility-muted)]"
            >
              Elige tu categoría
            </motion.h2>
            <CategoryPicker selected={tier} onSelect={setTier} />
          </section>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-3xl mobility-glass-panel p-6"
          >
            <div>
              <p className="text-lg font-semibold">
                {tier} seleccionado · {destination.trim() || "Sin destino aún"}
              </p>
              <p className="text-sm text-[var(--mobility-muted)]">
                Confirmación en un toque — pagos y tracking en tiempo real.
              </p>
            </div>
            <button
              type="button"
              className="rounded-2xl px-8 py-3.5 text-sm font-semibold mobility-accent-gradient text-[oklch(0.1_0_0)] shadow-lg transition hover:opacity-95 active:scale-[0.98]"
            >
              Solicitar {tier}
            </button>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

export default GextMain;
