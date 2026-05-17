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

    let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;
    try {
      session = await stripe.checkout.sessions.create({
        line_items: [{ price: stripePrice.id, quantity: 1 }],
        mode: isRecurring ? "subscription" : "payment",
        ui_mode: "embedded",
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
    } catch (err) {
      const stripeMsg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: string }).message)
          : String(err);
      console.error("[createCheckoutSession] Stripe:", stripeMsg);
      throw new Error(
        stripeMsg.includes("No such price") || stripeMsg.includes("lookup_key")
          ? `Precio «${data.priceId}» no existe en Stripe (${data.environment}). Ejecuta npm run gafcore:stripe-bootstrap y redeploy.`
          : `Stripe no pudo crear el checkout: ${stripeMsg}`,
      );
    }

    const cs = session.client_secret?.trim();
    if (!cs) {
      console.error("[createCheckoutSession] missing client_secret", {
        sessionId: session.id,
        uiMode: session.ui_mode,
        environment: data.environment,
      });
      throw new Error(
        "Stripe no devolvió client_secret (¿deploy antiguo sin ui_mode embedded?). Haz push del código y redeploy en Vercel.",
      );
    }
    /** `cs` evita posibles filtros de serialización sobre claves que contienen «secret». */
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
