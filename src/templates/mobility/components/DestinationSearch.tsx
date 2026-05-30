import { motion } from "framer-motion";
import { MapPin, Search } from "lucide-react";

type DestinationSearchProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function DestinationSearch({ value, onChange, onSubmit }: DestinationSearchProps) {
  return (
    <motion.form
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="mobility-glass-panel flex items-center gap-3 rounded-3xl px-5 py-4"
    >
      <div className="inline-flex size-11 shrink-0 items-center justify-center rounded-2xl mobility-accent-gradient shadow-lg">
        <MapPin className="size-5 text-[oklch(0.12_0_0)]" aria-hidden />
      </div>
      <label className="sr-only" htmlFor="mobility-destination">
        Destino
      </label>
      <input
        id="mobility-destination"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="¿A dónde vamos? Ej. Centro, Marina, Aeropuerto…"
        className="min-w-0 flex-1 bg-transparent text-base font-medium tracking-tight outline-none placeholder:text-[var(--mobility-muted)]"
      />
      <button
        type="submit"
        className="inline-flex size-11 items-center justify-center rounded-2xl mobility-accent-gradient text-[oklch(0.1_0_0)] shadow-md transition-transform hover:scale-[1.02] active:scale-[0.98]"
        aria-label="Buscar destino"
      >
        <Search className="size-5" />
      </button>
    </motion.form>
  );
}
