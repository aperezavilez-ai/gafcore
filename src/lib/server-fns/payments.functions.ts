import { createServerFn } from "@tanstack/react-start";
import { type StripeEnv, createStripeClient } from "@/lib/stripe.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PRICE_RE = /^[a-zA-Z0-9_-]+$/;

export const createCheckoutSession = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      priceId: string;
      customerEmail?: string;
      userId?: string;
      returnUrl: string;
      environment: StripeEnv;
      accessToken: string;
    }) => {
      if (!PRICE_RE.test(data.priceId)) throw new Error("Invalid priceId");
      if (data.environment !== "sandbox" && data.environment !== "live") {
        throw new Error("Invalid environment");
      }
      if (!data.accessToken) throw new Error("Unauthorized");
      return data;
    },
  )
  .handler(async ({ data }) => {
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(data.accessToken);
    if (authError || !authData.user) throw new Error("Unauthorized");

    const stripe = createStripeClient(data.environment);
    const userId = authData.user.id;

    let stripePrice: Awaited<ReturnType<typeof stripe.prices.retrieve>>;
    const byLookup = await stripe.prices.list({ lookup_keys: [data.priceId], limit: 1 });
    if (byLookup.data.length > 0) {
      stripePrice = byLookup.data[0];
    } else if (data.priceId.startsWith("price_")) {
      stripePrice = await stripe.prices.retrieve(data.priceId);
    } else {
      throw new Error(
        `Precio Stripe no encontrado para «${data.priceId}». Crea en Stripe un precio de pago único con lookup_key exactamente igual a ese id (p. ej. credits_pack_200), o usa el id técnico price_… del precio.`,
      );
    }
    const isRecurring = stripePrice.type === "recurring";

    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: stripePrice.id, quantity: 1 }],
      mode: isRecurring ? "subscription" : "payment",
      ui_mode: "embedded_page",
      return_url: data.returnUrl,
      ...((data.customerEmail || authData.user.email) && {
        customer_email: data.customerEmail || authData.user.email,
      }),
      metadata: { userId, gafcorePriceId: data.priceId },
      ...(isRecurring && {
        subscription_data: { metadata: { userId } },
      }),
      ...(!isRecurring && {
        payment_intent_data: {
          metadata: { userId, gafcorePriceId: data.priceId },
        },
      }),
    });

    if (!session.client_secret) throw new Error("Checkout session did not return a client secret");
    return { clientSecret: session.client_secret };
  });

/**
 * Abre el Customer Portal de Stripe (métodos de pago, facturas, cancelar plan).
 * Requiere `stripe_customer_id` en `subscriptions` (p. ej. tras un checkout de plan).
 */
export const createStripeCustomerPortalSession = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { accessToken: string; returnUrl: string; environment: StripeEnv }) => {
      if (!data.accessToken) throw new Error("Unauthorized");
      if (data.environment !== "sandbox" && data.environment !== "live") {
        throw new Error("Invalid environment");
      }
      return data;
    },
  )
  .handler(async ({ data }) => {
    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(data.accessToken);
    if (authError || !authData.user) throw new Error("Unauthorized");

    const { data: rows, error: qErr } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id, updated_at")
      .eq("user_id", authData.user.id)
      .eq("environment", data.environment)
      .order("updated_at", { ascending: false })
      .limit(20);

    if (qErr) {
      console.error("createStripeCustomerPortalSession query:", qErr);
      throw new Error("No se pudo consultar la suscripción");
    }

    const customerId = (rows ?? []).find(
      (r: { stripe_customer_id: string | null }) => typeof r.stripe_customer_id === "string" && r.stripe_customer_id.length > 0,
    )?.stripe_customer_id as string | undefined;

    if (!customerId) {
      throw new Error("GAFCORE_NO_STRIPE_CUSTOMER");
    }

    const stripe = createStripeClient(data.environment);
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: data.returnUrl,
    });
    if (!session.url) throw new Error("Stripe no devolvió URL del portal");
    return { url: session.url };
  });
