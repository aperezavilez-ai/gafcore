import { useEffect, useState } from "react";
import { supabase } from "@/lib/gafcore-supabase-client-proxy";

/**
 * Hook reutilizable: cualquier proyecto del ecosistema (GafCore, GafSuite,
 * GafMusic, GafAds, proyectos generados) puede usarlo para saber el plan
 * activo del usuario. Lee directamente la tabla `subscriptions` central.
 */
export type PlanTier = "free" | "starter" | "creator" | "pro" | "label";

export interface PlanAccess {
  loading: boolean;
  plan: PlanTier;
  active: boolean;
  expiresAt: string | null;
  features: Record<string, boolean>;
  /** Helper: ¿el plan actual cubre la feature requerida? */
  has: (feature: keyof typeof FEATURE_MATRIX["free"]) => boolean;
}

const FEATURE_MATRIX = {
  free: { ai_basic: true, ai_pro: false, distribute: false, label_tools: false, white_label: false, priority_support: false },
  starter: { ai_basic: true, ai_pro: false, distribute: true, label_tools: false, white_label: false, priority_support: false },
  creator: { ai_basic: true, ai_pro: true, distribute: true, label_tools: false, white_label: false, priority_support: false },
  pro: { ai_basic: true, ai_pro: true, distribute: true, label_tools: true, white_label: false, priority_support: true },
  label: { ai_basic: true, ai_pro: true, distribute: true, label_tools: true, white_label: true, priority_support: true },
} as const;

const PLAN_FROM_PRICE: Record<string, PlanTier> = {
  plan_basico_monthly: "starter",
  plan_pro_monthly: "creator",
  plan_premium_monthly: "pro",
  plan_creador_monthly: "label",
};

export function usePlanAccess(userId: string | null | undefined): PlanAccess {
  const [state, setState] = useState<Omit<PlanAccess, "has">>({
    loading: true,
    plan: "free",
    active: false,
    expiresAt: null,
    features: FEATURE_MATRIX.free,
  });

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setState({ loading: false, plan: "free", active: false, expiresAt: null, features: FEATURE_MATRIX.free });
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("price_id,plan_tier,status,current_period_end")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      const now = Date.now();
      const ends = data?.current_period_end ? new Date(data.current_period_end).getTime() : null;
      const isActive =
        !!data &&
        ["active", "trialing", "past_due"].includes(data.status) &&
        (ends === null || ends > now);

      const plan: PlanTier = isActive
        ? PLAN_FROM_PRICE[data?.price_id ?? ""] || ((data?.plan_tier as PlanTier) ?? "free")
        : "free";

      setState({
        loading: false,
        plan,
        active: isActive,
        expiresAt: data?.current_period_end ?? null,
        features: FEATURE_MATRIX[plan] ?? FEATURE_MATRIX.free,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { ...state, has: (f) => !!state.features[f] };
}
