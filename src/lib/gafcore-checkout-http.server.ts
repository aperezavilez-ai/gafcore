/**
 * Confirmación checkout Stripe — invocado desde `server.ts` (planes + extensiones).
 */
import { z } from "zod";
import { requireGafcoreApiUser } from "@/lib/gafcore-api-auth.server";
import { createStripeClient, type StripeEnv } from "@/lib/stripe.server";
import { applyGafcorePlanSubscription } from "@/lib/stripe-subscription-sync.server";
import { fulfillExtensionCheckoutSession } from "@/extensions/marketplace-payments.server";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

const BodySchema = z.object({
  session_id: z.string().min(3).max(256),
  environment: z.enum(["sandbox", "live"]),
});

/** POST /api/gafcore/checkout-confirm */
export async function handleGafcoreCheckoutConfirmPost(request: Request): Promise<Response> {
  const userId = await requireGafcoreApiUser(request);
  if (userId instanceof Response) return userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid_body" }, 400);

  const stripe = createStripeClient(parsed.data.environment as StripeEnv);

  try {
    const session = await stripe.checkout.sessions.retrieve(parsed.data.session_id, {
      expand: ["subscription"],
    });

    if (session.metadata?.userId && session.metadata.userId !== userId) {
      return json({ error: "unauthorized" }, 403);
    }

    if (session.mode === "payment") {
      if (session.metadata?.gafcorePurchaseType === "extension") {
        const ext = await fulfillExtensionCheckoutSession({
          sessionId: parsed.data.session_id,
          userId,
          environment: parsed.data.environment as StripeEnv,
        });
        if (!ext.ok) return json({ error: ext.error }, 400);
        return json({
          ok: true,
          mode: "extension",
          listing_id: ext.listingId,
          install_slug: ext.installSlug ?? null,
        });
      }
      return json({ ok: true, mode: "payment" }, 200);
    }

    if (session.mode !== "subscription") {
      return json({ error: "unsupported_checkout_mode" }, 400);
    }

    const sub =
      typeof session.subscription === "string"
        ? await stripe.subscriptions.retrieve(session.subscription)
        : session.subscription;

    if (!sub) return json({ error: "missing_subscription" }, 502);

    const priceId =
      session.metadata?.gafcorePriceId ??
      sub.items.data[0]?.price?.lookup_key ??
      sub.items.data[0]?.price?.metadata?.gafcore_price_id ??
      sub.items.data[0]?.price?.id;

    if (!priceId) return json({ error: "missing_price_id" }, 502);

    const item = sub.items.data[0];
    await applyGafcorePlanSubscription({
      userId,
      priceId,
      stripeSubscriptionId: sub.id,
      stripeCustomerId:
        typeof session.customer === "string" ? session.customer : session.customer?.id,
      productId:
        typeof item?.price?.product === "string" ? item.price.product : item?.price?.product?.id,
      status: sub.status,
      environment: parsed.data.environment as StripeEnv,
      currentPeriodStart: item?.current_period_start
        ? new Date(item.current_period_start * 1000).toISOString()
        : null,
      currentPeriodEnd: item?.current_period_end
        ? new Date(item.current_period_end * 1000).toISOString()
        : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    });

    return json({ ok: true, price_id: priceId, status: sub.status }, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[checkout-confirm]", message);
    return json({ error: message }, 502);
  }
}
