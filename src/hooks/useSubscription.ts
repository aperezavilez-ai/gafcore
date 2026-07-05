import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/gafcore-supabase-client-proxy";
import { getStripeEnvironment } from "@/lib/stripe";
import { logClientWarn } from "@/lib/gafcore-client-logger";

export interface Subscription {
  id: string;
  user_id: string;
  paddle_subscription_id: string | null;
  paddle_customer_id: string | null;
  product_id: string;
  price_id: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  environment: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  /** Columna en BD (Stripe webhook); sirve si `price_id` es un id técnico de Stripe. */
  plan_tier?: string | null;
}

/**
 * Texto para la barra del IDE: sin suscripción activa → siempre "Plan Gratis" (aunque hayan comprado créditos sueltos).
 * Con suscripción de pago activa → nombre del plan según `price_id` o `plan_tier`.
 */
export function resolveGafcorePlanDisplayLabel(args: {
  isAdmin: boolean;
  subActive: boolean;
  priceId: string | null | undefined;
  planTierCol: string | null | undefined;
}): string {
  const { isAdmin, subActive, priceId, planTierCol } = args;
  if (isAdmin) return "Administrador";
  if (!subActive) return "Plan Gratis";
  const pid = priceId ?? "";
  if (pid === "plan_basico_monthly") return "Plan Starter";
  if (pid === "plan_pro_monthly" || pid === "plan_creador_monthly") return "Plan Creador";
  if (pid === "plan_premium_monthly") return "Plan Pro";
  const t = (planTierCol ?? "").toLowerCase();
  if (t === "basico") return "Plan Starter";
  if (t === "pro") return "Plan Creador";
  if (t === "premium") return "Plan Pro";
  if (t === "creador") return "Plan Creador";
  if (pid.startsWith("price_")) return "Plan de pago";
  return "Plan de pago";
}

export function useSubscription(userId: string | undefined) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const env = getStripeEnvironment();

  useEffect(() => {
    if (!userId) {
      setSubscription(null);
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function resolveIsAdmin(uid: string): Promise<boolean> {
      const { data: rpcAdmin, error: rpcErr } = await supabase.rpc("has_role", {
        _user_id: uid,
        _role: "admin",
      });
      if (!rpcErr && typeof rpcAdmin === "boolean") return rpcAdmin;
      if (rpcErr) logClientWarn("useSubscription has_role", rpcErr.message);
      const { data, error: roleErr } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", uid)
        .eq("role", "admin")
        .maybeSingle();
      if (roleErr) console.warn("[useSubscription] user_roles:", roleErr.message);
      return !!data;
    }

    const load = async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const [subRes, adminFlag] = await Promise.all([
          supabase
            .from("subscriptions")
            .select("*")
            .eq("user_id", userId)
            .eq("environment", env)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          resolveIsAdmin(userId),
        ]);
        if (cancelled) return;
        const { data: subData, error: subErr } = subRes;
        if (subErr) {
          logClientWarn("useSubscription subscriptions", subErr.message);
          setSubscription(null);
        } else {
          setSubscription(subData as Subscription | null);
        }
        setIsAdmin(adminFlag);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    // Realtime updates. Use a unique topic per hook instance because this hook
    // can be mounted more than once on dashboard pages.
    const channelName = `sub-${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "subscriptions",
          filter: `user_id=eq.${userId}`,
        },
        () => void load({ silent: true }),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_roles",
          filter: `user_id=eq.${userId}`,
        },
        () => void load({ silent: true }),
      )
      .subscribe();

    const onExternalRefresh = () => {
      void load({ silent: true });
    };
    window.addEventListener("gafcore:credits-applied", onExternalRefresh);
    window.addEventListener("gafcore:credits-refresh", onExternalRefresh);

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      window.removeEventListener("gafcore:credits-applied", onExternalRefresh);
      window.removeEventListener("gafcore:credits-refresh", onExternalRefresh);
    };
  }, [userId, env]);

  const subActive = !!subscription && (
    (["active", "trialing", "past_due"].includes(subscription.status) &&
      (!subscription.current_period_end || new Date(subscription.current_period_end) > new Date())) ||
    (subscription.status === "canceled" &&
      !!subscription.current_period_end && new Date(subscription.current_period_end) > new Date())
  );

  const isActive = isAdmin || subActive;

  const planTierCol = subscription?.plan_tier ?? null;

  const planName = isAdmin ? "Master" :
                   subscription?.price_id === "plan_creador_monthly" ? "Creador" :
                   subscription?.price_id === "plan_premium_monthly" ? "Pro" :
                   subscription?.price_id === "plan_pro_monthly" ? "Creador" :
                   subscription?.price_id === "plan_basico_monthly" ? "Starter" : null;

  // Tier: "creador" => unlimited (fair-use). All other paid plans grant full access.
  const planTier: "basico" | "pro" | "premium" | "creador" | null =
    isAdmin ? "creador" :
    subscription?.price_id === "plan_creador_monthly" ? "creador" :
    subscription?.price_id === "plan_premium_monthly" ? "premium" :
    subscription?.price_id === "plan_pro_monthly" ? "pro" :
    subscription?.price_id === "plan_basico_monthly" ? "basico" :
    planTierCol === "basico" ? "basico" :
    planTierCol === "pro" ? "pro" :
    planTierCol === "premium" ? "premium" :
    planTierCol === "creador" ? "creador" :
    null;

  const planDisplayLabel = resolveGafcorePlanDisplayLabel({
    isAdmin,
    subActive,
    priceId: subscription?.price_id,
    planTierCol,
  });

  return { subscription, isActive, planName, planTier, planDisplayLabel, loading, isAdmin, subActive };
}
