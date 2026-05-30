import { motion } from "framer-motion";
import { Crown, Users, Zap } from "lucide-react";

export type RideTier = "X" | "VIP" | "XL";

const TIERS: Array<{
  id: RideTier;
  title: string;
  subtitle: string;
  eta: string;
  price: string;
  icon: typeof Zap;
}> = [
  { id: "X", title: "Gext X", subtitle: "Económico · 4 pax", eta: "3 min", price: "$89", icon: Zap },
  {
    id: "VIP",
    title: "Gext VIP",
    subtitle: "Premium · chofer top",
    eta: "5 min",
    price: "$149",
    icon: Crown,
  },
  {
    id: "XL",
    title: "Gext XL",
    subtitle: "SUV · 6 pax · equipaje",
    eta: "7 min",
    price: "$199",
    icon: Users,
  },
];

type CategoryPickerProps = {
  selected: RideTier;
  onSelect: (tier: RideTier) => void;
};

export function CategoryPicker({ selected, onSelect }: CategoryPickerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.15, ease: "easeOut" }}
      className="grid gap-4 sm:grid-cols-3"
    >
      {TIERS.map((tier, index) => {
        const Icon = tier.icon;
        const active = selected === tier.id;
        return (
          <motion.button
            key={tier.id}
            type="button"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + index * 0.08 }}
            onClick={() => onSelect(tier.id)}
            className={`rounded-3xl border p-5 text-left transition-all duration-300 ${
              active
                ? "mobility-glass-panel border-[var(--mobility-accent)] shadow-xl ring-2 ring-[var(--mobility-accent)]/40"
                : "border-[var(--mobility-border)] bg-[var(--mobility-card)]/80 hover:border-[var(--mobility-accent-dim)] hover:shadow-lg"
            }`}
          >
            <div
              className={`mb-4 inline-flex size-12 items-center justify-center rounded-2xl ${
                active ? "mobility-accent-gradient" : "bg-[oklch(0.22_0.02_265)]"
              }`}
            >
              <Icon
                className={`size-6 ${active ? "text-[oklch(0.1_0_0)]" : "text-[var(--mobility-accent)]"}`}
              />
            </div>
            <p className="text-lg font-bold tracking-tight">{tier.title}</p>
            <p className="mt-1 text-xs text-[var(--mobility-muted)]">{tier.subtitle}</p>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-[var(--mobility-muted)]">{tier.eta}</span>
              <span className="font-semibold text-[var(--mobility-accent)]">{tier.price}</span>
            </div>
          </motion.button>
        );
      })}
    </motion.div>
  );
}
