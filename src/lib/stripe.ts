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

/** Valida que el client_secret de Checkout coincida con pk_test / pk_live del cliente. */
export function assertCheckoutSecretMatchesPublishableKey(clientSecret: string): void {
  const env = getStripeEnvironment();
  const isTestSecret = clientSecret.startsWith("cs_test_");
  const isLiveSecret = clientSecret.startsWith("cs_live_");
  if (env === "sandbox" && !isTestSecret) {
    throw new Error(
      "Claves Stripe mezcladas: el navegador usa pk_test_ pero el servidor creó una sesión live. En Vercel pon VITE_PAYMENTS_CLIENT_TOKEN=pk_test_… y STRIPE_SANDBOX_API_KEY=sk_test_… (misma cuenta, modo test).",
    );
  }
  if (env === "live" && !isLiveSecret) {
    throw new Error(
      "Claves Stripe mezcladas: el navegador usa pk_live_ pero el servidor usó sk_test_. Usa pk_live_ + STRIPE_LIVE_API_KEY en producción real.",
    );
  }
}
