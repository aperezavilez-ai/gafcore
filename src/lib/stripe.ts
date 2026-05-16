import { loadStripe, type Stripe } from "@stripe/stripe-js";

type StripeEnv = "sandbox" | "live";

function publishableKey(): string | undefined {
  const v = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN;
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

let stripePromise: Promise<Stripe | null> | null = null;

/** Carga Stripe.js; sin clave pública devuelve `null` (no lanza). */
export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    const key = publishableKey();
    stripePromise = key ? loadStripe(key) : Promise.resolve(null);
  }
  return stripePromise;
}

/**
 * Entorno de API Stripe (clave secreta en servidor).
 * Sin `VITE_PAYMENTS_CLIENT_TOKEN` no forzar "live" (evita llamar live sin pk_live).
 */
export function getStripeEnvironment(): StripeEnv {
  const key = publishableKey();
  if (!key) return "sandbox";
  return key.startsWith("pk_test_") ? "sandbox" : "live";
}
