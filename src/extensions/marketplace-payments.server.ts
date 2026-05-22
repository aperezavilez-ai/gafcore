import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createStripeClient, type StripeEnv } from "@/lib/stripe.server";
import { installListingForUser } from "@/extensions/marketplace.server";

export type ExtensionCheckoutSession = {
  clientSecret: string;
  sessionId: string;
  amountCents: number;
  currency: string;
};

export async function userHasCompletedExtensionPurchase(
  userId: string,
  listingId: string,
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("gafcore_extension_purchases")
    .select("id")
    .eq("user_id", userId)
    .eq("listing_id", listingId)
    .eq("status", "completed")
    .maybeSingle();
  return Boolean(data?.id);
}

export async function createExtensionCheckoutSession(input: {
  userId: string;
  listingId: string;
  returnUrl: string;
  environment: StripeEnv;
  customerEmail?: string;
}): Promise<{ ok: true; checkout: ExtensionCheckoutSession } | { ok: false; error: string }> {
  const { data: listing } = await supabaseAdmin
    .from("gafcore_marketplace_listings")
    .select("id, slug, name, description, state, price_cents, currency")
    .eq("id", input.listingId)
    .maybeSingle();

  if (!listing || listing.state !== "published") {
    return { ok: false, error: "listing_not_found" };
  }

  const amountCents = listing.price_cents ?? 0;
  if (amountCents <= 0) {
    return { ok: false, error: "listing_is_free" };
  }

  if (await userHasCompletedExtensionPurchase(input.userId, listing.id)) {
    return { ok: false, error: "already_purchased" };
  }

  const currency = (listing.currency ?? "eur").trim().toLowerCase() || "eur";
  const stripe = createStripeClient(input.environment);

  let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>>;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      ui_mode: "embedded_page",
      return_url: input.returnUrl,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amountCents,
            product_data: {
              name: listing.name,
              description: listing.description?.slice(0, 200) ?? undefined,
              metadata: { gafcore_listing_slug: listing.slug },
            },
          },
        },
      ],
      ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
      metadata: {
        userId: input.userId,
        listingId: listing.id,
        gafcorePurchaseType: "extension",
      },
      payment_intent_data: {
        metadata: {
          userId: input.userId,
          listingId: listing.id,
          gafcorePurchaseType: "extension",
        },
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[extension-checkout] Stripe:", msg);
    return { ok: false, error: "stripe_checkout_failed" };
  }

  const clientSecret = session.client_secret?.trim();
  if (!clientSecret) return { ok: false, error: "missing_client_secret" };

  const { error: insErr } = await supabaseAdmin.from("gafcore_extension_purchases").upsert(
    {
      user_id: input.userId,
      listing_id: listing.id,
      stripe_session_id: session.id,
      amount_cents: amountCents,
      currency,
      status: "pending",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_session_id" },
  );

  if (insErr) {
    console.error("[extension-checkout] purchase row:", insErr.message);
    return { ok: false, error: "purchase_record_failed" };
  }

  return {
    ok: true,
    checkout: {
      clientSecret,
      sessionId: session.id,
      amountCents,
      currency,
    },
  };
}

export async function fulfillExtensionCheckoutSession(input: {
  sessionId: string;
  userId: string;
  environment: StripeEnv;
}): Promise<
  | { ok: true; listingId: string; installSlug?: string; alreadyFulfilled?: boolean }
  | { ok: false; error: string }
> {
  const stripe = createStripeClient(input.environment);
  const session = await stripe.checkout.sessions.retrieve(input.sessionId);

  if (session.metadata?.gafcorePurchaseType !== "extension") {
    return { ok: false, error: "not_extension_checkout" };
  }

  if (session.metadata?.userId && session.metadata.userId !== input.userId) {
    return { ok: false, error: "unauthorized" };
  }

  if (session.payment_status !== "paid") {
    return { ok: false, error: "payment_not_completed" };
  }

  const listingId = session.metadata?.listingId;
  if (!listingId) return { ok: false, error: "missing_listing_id" };

  const { data: existing } = await supabaseAdmin
    .from("gafcore_extension_purchases")
    .select("id, status")
    .eq("user_id", input.userId)
    .eq("listing_id", listingId)
    .eq("status", "completed")
    .maybeSingle();

  if (existing?.id) {
    return { ok: true, listingId, alreadyFulfilled: true };
  }

  const amountCents = session.amount_total ?? 0;
  const currency = (session.currency ?? "eur").toLowerCase();

  const { error: upsertErr } = await supabaseAdmin.from("gafcore_extension_purchases").upsert(
    {
      user_id: input.userId,
      listing_id: listingId,
      stripe_session_id: session.id,
      amount_cents: amountCents > 0 ? amountCents : 1,
      currency,
      status: "completed",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_session_id" },
  );

  if (upsertErr) {
    console.error("[extension-checkout] fulfill upsert:", upsertErr.message);
    return { ok: false, error: "purchase_record_failed" };
  }

  const install = await installListingForUser(input.userId, listingId);
  if (!install.ok) {
    console.warn("[extension-checkout] auto-install:", install.error);
    return { ok: true, listingId };
  }

  return { ok: true, listingId, installSlug: install.installSlug };
}

export async function fulfillExtensionCheckoutFromWebhook(session: {
  id: string;
  mode?: string;
  payment_status?: string;
  metadata?: { userId?: string; listingId?: string; gafcorePurchaseType?: string };
  amount_total?: number | null;
  currency?: string | null;
}): Promise<void> {
  if (session.mode !== "payment") return;
  if (session.metadata?.gafcorePurchaseType !== "extension") return;
  if (session.payment_status && session.payment_status !== "paid") return;

  const userId = session.metadata?.userId;
  const listingId = session.metadata?.listingId;
  if (!userId || !listingId) return;

  const { data: existing } = await supabaseAdmin
    .from("gafcore_extension_purchases")
    .select("id")
    .eq("user_id", userId)
    .eq("listing_id", listingId)
    .eq("status", "completed")
    .maybeSingle();

  if (existing?.id) return;

  const amountCents = session.amount_total ?? 0;
  const currency = (session.currency ?? "eur").toLowerCase();

  await supabaseAdmin.from("gafcore_extension_purchases").upsert(
    {
      user_id: userId,
      listing_id: listingId,
      stripe_session_id: session.id,
      amount_cents: amountCents > 0 ? amountCents : 1,
      currency,
      status: "completed",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_session_id" },
  );

  const install = await installListingForUser(userId, listingId);
  if (!install.ok) {
    console.warn("[extension-webhook] auto-install:", install.error);
  }
}
