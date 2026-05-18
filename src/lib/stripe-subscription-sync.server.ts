import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { StripeEnv } from "@/lib/stripe.server";

export const PLAN_CREDITS: Record<string, { credits: number; tier: string }> = {
  plan_basico_monthly: { credits: 70, tier: "basico" },
  plan_pro_monthly: { credits: 150, tier: "pro" },
  plan_premium_monthly: { credits: 350, tier: "premium" },
  plan_creador_monthly: { credits: 0, tier: "creador" },
};

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export type ApplyPlanSubscriptionInput = {
  userId: string;
  priceId: string;
  stripeSubscriptionId: string;
  stripeCustomerId?: string | null;
  productId?: string | null;
  status: string;
  environment: StripeEnv;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
};

/** Tras checkout o webhook: guarda suscripción y ajusta cupo mensual (sin duplicar créditos si ya estaba activa). */
export async function applyGafcorePlanSubscription(input: ApplyPlanSubscriptionInput): Promise<void> {
  const planInfo = PLAN_CREDITS[input.priceId];
  if (!planInfo) {
    throw new Error(`Plan desconocido: ${input.priceId}`);
  }

  const { data: prior } = await supabaseAdmin
    .from("subscriptions")
    .select("id, status, stripe_subscription_id")
    .eq("user_id", input.userId)
    .eq("environment", input.environment)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const hadActivePlan = !!prior && ACTIVE_STATUSES.has(prior.status);

  await supabaseAdmin.from("subscriptions").upsert(
    {
      user_id: input.userId,
      stripe_subscription_id: input.stripeSubscriptionId,
      stripe_customer_id: input.stripeCustomerId ?? null,
      product_id: input.productId ?? null,
      price_id: input.priceId,
      status: input.status,
      current_period_start: input.currentPeriodStart ?? null,
      current_period_end: input.currentPeriodEnd ?? null,
      cancel_at_period_end: input.cancelAtPeriodEnd ?? false,
      environment: input.environment,
      monthly_credits: planInfo.credits,
      plan_tier: planInfo.tier,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" },
  );

  const monthlyAllowance = planInfo.tier === "creador" ? 1000 : planInfo.credits;
  await supabaseAdmin
    .from("user_credits")
    .update({
      monthly_allowance: monthlyAllowance,
      daily_limit: monthlyAllowance,
      last_reset_at: new Date().toISOString(),
    })
    .eq("user_id", input.userId);

  if (!hadActivePlan && planInfo.credits > 0) {
    await supabaseAdmin.rpc("add_credits", {
      p_user_id: input.userId,
      p_amount: planInfo.credits,
      p_reason: "monthly_grant",
      p_metadata: {
        price_id: input.priceId,
        subscription_id: input.stripeSubscriptionId,
      },
    });
  }
}
