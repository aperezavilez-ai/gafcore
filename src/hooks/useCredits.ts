import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/gafcore-supabase-client-proxy";
import { consumeCredits } from "@/lib/server-fns/credits.functions";

export function useCredits(userId: string | undefined) {
  const [balance, setBalance] = useState<number>(0);
  const [monthlyAllowance, setMonthlyAllowance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [isUnlimitedDaily, setIsUnlimitedDaily] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("user_credits")
      .select("balance, monthly_allowance")
      .eq("user_id", userId)
      .maybeSingle();
    const nextBalance = (data?.balance as number | null) ?? 0;
    const nextAllowance = (data?.monthly_allowance as number | null) ?? 0;
    setBalance(nextBalance);
    setMonthlyAllowance(nextAllowance);
    /** Cupo ≥1000 = fair-use / admin en `consume_credits` (sin tope por saldo mostrado). */
    setIsUnlimitedDaily(nextAllowance >= 1000);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
    if (!userId) return;
    const channelName = `credits-${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const ch = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_credits", filter: `user_id=eq.${userId}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, refresh]);

  /** Otras partes del IDE (p. ej. sync de bienvenida en ChatPanel) disparan esto para unificar saldos. */
  useEffect(() => {
    if (!userId) return;
    const onRefresh = () => {
      void refresh();
    };
    window.addEventListener("gafcore:credits-refresh", onRefresh);
    return () => window.removeEventListener("gafcore:credits-refresh", onRefresh);
  }, [userId, refresh]);

  /** Returns true on success, false on insufficient credits, throws on real errors. */
  const consume = useCallback(
    async (amount: number, reason: string, metadata: Record<string, unknown> = {}) => {
      if (!userId) return false;
      const result = await consumeCredits({ data: { amount, reason, metadata } });
      if (result?.ok) {
        setBalance(result.balance ?? balance - amount);
        if (result.unlimited) {
          setIsUnlimitedDaily(true);
          setMonthlyAllowance(result.daily_limit ?? 1000);
        }
        return true;
      }
      return false;
    },
    [userId, balance],
  );

  return { balance, monthlyAllowance, loading, refresh, consume, isUnlimitedDaily };
}
