import { createServerFn } from "@tanstack/react-start";
import { type StripeEnv, createStripeClient } from "@/lib/stripe.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createEmbeddedCheckoutClientSecret } from "@/lib/stripe-checkout.server";

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

    const cs = await createEmbeddedCheckoutClientSecret({
      priceId: data.priceId,
      customerEmail: data.customerEmail,
      returnUrl: data.returnUrl,
      environment: data.environment,
      userId: authData.user.id,
      userEmail: authData.user.email,
    });
    return { cs, clientSecret: cs };
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
