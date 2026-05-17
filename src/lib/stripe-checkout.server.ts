import { type StripeEnv, createStripeClient } from "@/lib/stripe.server";

const PRICE_RE = /^[a-zA-Z0-9_-]+$/;

export type CreateEmbeddedCheckoutInput = {
  priceId: string;
  customerEmail?: string;
  returnUrl: string;
  environment: StripeEnv;
  userId: string;
  userEmail?: string | null;
};

/** Crea sesión Stripe Checkout (embedded_page) y devuelve client_secret. */
export async function createEmbeddedCheckoutClientSecret(
  input: CreateEmbeddedCheckoutInput,
): Promise<string> {
  if (!PRICE_RE.test(input.priceId)) {
    throw new Error("Invalid priceId");
  }
  if (input.environment !== "sandbox" && input.environment !== "live") {
    throw new Error("Invalid environment");
  }

  const stripe = createStripeClient(input.environment);

  let stripePrice: Awaited<ReturnType<typeof stripe.prices.retrieve>>;
  const byLookup = await stripe.prices.list({ lookup_keys: [input.priceId], limit: 1 });
  if (byLookup.data.length > 0) {
    stripePrice = byLookup.data[0];
  } else if (input.priceId.startsWith("price_")) {
    stripePrice = await stripe.prices.retrieve(input.priceId);
  } else {
    throw new Error(
      `Precio Stripe no encontrado para «${input.priceId}». Ejecuta npm run gafcore:stripe-bootstrap.`,
    );
  }
  const isRecurring = stripePrice.type === "recurring";
  const email = input.customerEmail || input.userEmail || undefined;

  let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;
  try {
    session = await stripe.checkout.sessions.create({
      line_items: [{ price: stripePrice.id, quantity: 1 }],
      mode: isRecurring ? "subscription" : "payment",
      ui_mode: "embedded_page",
      return_url: input.returnUrl,
      ...(email && { customer_email: email }),
      metadata: { userId: input.userId, gafcorePriceId: input.priceId },
      ...(isRecurring && {
        subscription_data: { metadata: { userId: input.userId } },
      }),
      ...(!isRecurring && {
        payment_intent_data: {
          metadata: { userId: input.userId, gafcorePriceId: input.priceId },
        },
      }),
    });
  } catch (err) {
    const stripeMsg =
      err && typeof err === "object" && "message" in err
        ? String((err as { message?: string }).message)
        : String(err);
    console.error("[stripe-checkout] Stripe:", stripeMsg);
    throw new Error(
      stripeMsg.includes("No such price") || stripeMsg.includes("lookup_key")
        ? `Precio «${input.priceId}» no existe en Stripe (${input.environment}). Ejecuta npm run gafcore:stripe-bootstrap.`
        : `Stripe no pudo crear el checkout: ${stripeMsg}`,
    );
  }

  const cs = session.client_secret?.trim();
  if (!cs) {
    console.error("[stripe-checkout] missing client_secret", {
      sessionId: session.id,
      uiMode: session.ui_mode,
    });
    throw new Error("Stripe no devolvió client_secret para embedded_page.");
  }
  return cs;
}
