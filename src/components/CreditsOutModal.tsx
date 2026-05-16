import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Coins, Check, Sparkles, Zap, Crown, Flame, Rocket, Gem } from "lucide-react";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  userId?: string;
  userEmail?: string;
  currentPlan?: string | null;
  reason?: "insufficient" | "buy";
  returnUrl?: string;
}

// Paquetes de 50 en 50 créditos, $0.20 por crédito ($10 cada 50).
const PACK_ICONS = [Sparkles, Zap, Flame, Crown, Rocket, Gem];
const PACK_COLORS = [
  "text-cyan-300",
  "text-violet-300",
  "text-fuchsia-300",
  "text-amber-300",
  "text-pink-300",
  "text-emerald-300",
];
const PACKS = Array.from({ length: 24 }, (_, i) => {
  const credits = (i + 1) * 50;
  const price = (i + 1) * 10;
  let tag: string | null = null;
  if (credits === 200) tag = "Popular";
  if (credits === 600) tag = "Recomendado";
  if (credits === 1200) tag = "Mejor valor";
  return {
    id: `credits_pack_${credits}`,
    credits,
    price,
    icon: PACK_ICONS[i % PACK_ICONS.length],
    color: PACK_COLORS[i % PACK_COLORS.length],
    tag,
  };
});

export function CreditsOutModal({ open, onOpenChange, userId, userEmail, reason = "insufficient", returnUrl }: Props) {
  const [selected, setSelected] = useState<string>("credits_pack_200");
  const [checkoutPriceId, setCheckoutPriceId] = useState<string | null>(null);

  const handleClose = (o: boolean) => {
    if (!o) setCheckoutPriceId(null);
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        positionVariant={checkoutPriceId ? "stripe-safe" : "default"}
        className="bg-zinc-950 border-white/10 text-white max-w-3xl"
      >
        {!checkoutPriceId ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl">
                <Coins className="text-amber-300" size={20} />
                {reason === "insufficient" ? "Te quedaste sin créditos" : "Compra créditos"}
              </DialogTitle>
              <DialogDescription className="text-white/60">
                Elige el paquete que necesites. Pago único, sin suscripción. Los créditos se acreditan al instante.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-2 py-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 max-h-[55vh] overflow-y-auto pr-1">
              {PACKS.map((p) => {
                const Icon = p.icon;
                const isSel = selected === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelected(p.id)}
                    className={`relative text-left rounded-xl border p-3 transition ${
                      isSel
                        ? "border-fuchsia-400/60 bg-fuchsia-500/10"
                        : "border-white/10 bg-white/[0.02] hover:bg-white/[0.05]"
                    }`}
                  >
                    {p.tag && (
                      <span className="absolute -top-2 right-3 rounded-full bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                        {p.tag}
                      </span>
                    )}
                    <div className="flex items-center gap-2 mb-1">
                      <Icon size={14} className={p.color} />
                      <span className="text-xs font-semibold">{p.credits.toLocaleString()} créditos</span>
                      {isSel && <Check size={12} className="ml-auto text-fuchsia-300" />}
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-black">${p.price}</span>
                      <span className="text-[10px] text-white/50">USD</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <p className="text-[11px] text-white/40 text-center">
              $0.20 por crédito · pago único · los créditos no caducan.
            </p>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="border-white/15 bg-white/5 text-white">
                Cancelar
              </Button>
              <Button
                onClick={() => setCheckoutPriceId(selected)}
                className="bg-gradient-to-r from-fuchsia-500 via-violet-500 to-cyan-400 text-white border-0"
              >
                Comprar créditos
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Completa tu pago</DialogTitle>
              <DialogDescription className="text-white/60">
                Pago seguro procesado por Stripe.
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-[min(420px,50vh)] overflow-visible rounded-xl bg-white p-2">
              <StripeEmbeddedCheckout
                priceId={checkoutPriceId}
                userId={userId}
                customerEmail={userEmail}
                returnUrl={returnUrl}
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCheckoutPriceId(null)} className="text-white/70">
                ← Volver
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
