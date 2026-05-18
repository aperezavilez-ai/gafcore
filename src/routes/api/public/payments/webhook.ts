import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";
import {
  PLAN_CREDITS,
  applyGafcorePlanSubscription,
} from "@/lib/stripe-subscription-sync.server";

type QueryChain = PromiseLike<unknown> & {
  eq: (column: string, value: unknown) => QueryChain;
};

type BillingSupabase = {
  from: (table: string) => {
    upsert: (
      values: Record<string, unknown>,
      options?: Record<string, unknown>,
    ) => PromiseLike<unknown>;
    update: (values: Record<string, unknown>) => QueryChain;
  };
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<unknown>;
};

let _supabase: BillingSupabase | null = null;
function getSupabase(): BillingSupabase {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    ) as unknown as BillingSupabase;
  }
  return _supabase;
}

type StripeSubscriptionPayload = {
  id: string;
  customer: string;
  status: string;
  current_period_start?: number;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  metadata?: { userId?: string };
  items?: {
    data?: Array<{
      price?: {
        id?: string;
        lookup_key?: string | null;
        product?: string;
        metadata?: Record<string, string | undefined>;
      };
      current_period_start?: number;
      current_period_end?: number;
    }>;
  };
};

type StripeInvoicePayload = {
  id: string;
  subscription?: string;
  billing_reason?: string;
  subscription_details?: { metadata?: { userId?: string } };
  lines?: {
    data?: Array<{
      price?: {
        id?: string;
        lookup_key?: string | null;
        metadata?: Record<string, string | undefined>;
      };
    }>;
  };
};

function resolveStripePlanPriceId(
  price:
    | undefined
    | {
        id?: string;
        lookup_key?: string | null;
        metadata?: Record<string, string | undefined>;
      },
): string | undefined {
  if (!price) return undefined;
  const meta = price.metadata ?? {};
  if (typeof price.lookup_key === "string" && price.lookup_key.length > 0) return price.lookup_key;
  const ext = meta["gafcore_price_id"];
  if (typeof ext === "string" && ext.length > 0) return ext;
  return price.id;
}

async function handleSubscriptionCreated(subscription: StripeSubscriptionPayload, env: StripeEnv) {
  const userId = subscription.metadata?.userId;
  if (!userId) {
    console.error("No userId in subscription metadata");
    return;
  }

  const item = subscription.items?.data?.[0];
  const priceId = resolveStripePlanPriceId(item?.price);
  const productId = item?.price?.product;
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;

  if (!priceId) {
    console.error("No priceId on subscription", subscription.id);
    return;
  }

  await applyGafcorePlanSubscription({
    userId,
    priceId,
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: subscription.customer,
    productId: typeof productId === "string" ? productId : undefined,
    status: subscription.status,
    environment: env,
    currentPeriodStart: periodStart ? new Date(periodStart * 1000).toISOString() : null,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
  });
}

async function handleSubscriptionUpdated(subscription: StripeSubscriptionPayload, env: StripeEnv) {
  const item = subscription.items?.data?.[0];
  const priceId = resolveStripePlanPriceId(item?.price);
  const productId = item?.price?.product;
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;
  const planInfo = priceId ? PLAN_CREDITS[priceId] : undefined;

  await getSupabase()
    .from("subscriptions")
    .update({
      status: subscription.status,
      product_id: productId,
      price_id: priceId,
      current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end || false,
      monthly_credits: planInfo?.credits ?? 0,
      plan_tier: planInfo?.tier ?? "creator",
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id)
    .eq("environment", env);
}

async function handleSubscriptionDeleted(subscription: StripeSubscriptionPayload, env: StripeEnv) {
  await getSupabase()
    .from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscription.id)
    .eq("environment", env);
}

async function handleInvoicePaid(invoice: StripeInvoicePayload, _env: StripeEnv) {
  // Recurring monthly grant on subsequent invoices.
  if (!invoice.subscription || invoice.billing_reason !== "subscription_cycle") return;
  const userId = invoice.subscription_details?.metadata?.userId;
  if (!userId) return;
  const line = invoice.lines?.data?.[0];
  const priceId = resolveStripePlanPriceId(line?.price);
  const planInfo = priceId ? PLAN_CREDITS[priceId] : undefined;
  if (!planInfo) return;
  await getSupabase().rpc("add_credits", {
    p_user_id: userId,
    p_amount: planInfo.credits,
    p_reason: "monthly_grant",
    p_metadata: { invoice_id: invoice.id, price_id: priceId },
  });
}

// Credit pack price_id → amount of credits.
// Acepta cualquier paquete con el patrón `credits_pack_<N>` (50, 100, 150, ... 1200).
function creditsForPriceId(priceId: string): number | null {
  const match = /^credits_pack_(\d+)$/.exec(priceId);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0 || n > 5000) return null;
  return n;
}

type StripeCheckoutSession = {
  id: string;
  mode?: string;
  payment_status?: string;
  subscription?: string;
  customer?: string;
  metadata?: { userId?: string; gafcorePriceId?: string };
};

async function handleCheckoutCompleted(session: StripeCheckoutSession, env: StripeEnv) {
  if (session.payment_status && session.payment_status !== "paid") return;

  if (session.mode === "subscription") {
    const userId = session.metadata?.userId;
    const priceId = session.metadata?.gafcorePriceId;
    const subId = session.subscription;
    if (!userId || !priceId || !subId) return;
    await applyGafcorePlanSubscription({
      userId,
      priceId,
      stripeSubscriptionId: subId,
      stripeCustomerId: session.customer,
      status: "active",
      environment: env,
    });
    return;
  }

  if (session.mode !== "payment") return;
  const userId = session.metadata?.userId;
  const priceId = session.metadata?.gafcorePriceId;
  if (!userId || !priceId) return;
  const credits = creditsForPriceId(priceId);
  if (!credits) return;
  await getSupabase().rpc("add_credits", {
    p_user_id: userId,
    p_amount: credits,
    p_reason: "credit_pack_purchase",
    p_metadata: { session_id: session.id, price_id: priceId },
  });
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);

  // Idempotency: skip if event already processed
  const eventId = (event as any).id;
  if (eventId) {
    const provider = `stripe_${env}`;
    const res: any = await (getSupabase() as any)
      .from("webhook_events")
      .upsert(
        {
          provider,
          event_id: eventId,
          event_type: (event as any).type,
          payload: event as any,
        },
        { onConflict: "provider,event_id", ignoreDuplicates: true },
      )
      .select("id");
    if (res?.data && Array.isArray(res.data) && res.data.length === 0) {
      console.log("Duplicate webhook event ignored:", eventId);
      return;
    }
  }

  switch (event.type) {
    case "customer.subscription.created":
      await handleSubscriptionCreated(event.data.object, env);
      break;
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event.data.object, env);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object, env);
      break;
    case "invoice.paid":
    case "invoice.payment_succeeded":
      await handleInvoicePaid(event.data.object, env);
      break;
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await handleCheckoutCompleted(event.data.object, env);
      break;
    default:
      console.log("Unhandled event:", event.type);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          console.error("Webhook invalid env:", rawEnv);
          return Response.json({ received: true, ignored: "invalid env" });
        }
        const env: StripeEnv = rawEnv;
        try {
          await handleWebhook(request, env);
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
