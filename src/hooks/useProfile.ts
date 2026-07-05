import { useState, useEffect } from "react";
import { supabase } from "@/lib/gafcore-supabase-client-proxy";

export interface Profile {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  artist_name: string | null;
  avatar_url: string | null;
  onboarding_completed?: boolean;
  onboarding_data?: Record<string, any>;
}

export function useProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    setProfile(data as Profile | null);
  };

  useEffect(() => {
    if (!userId) { setLoading(false); return; }

    supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        setProfile(data as Profile | null);
        setLoading(false);
      });
  }, [userId]);

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!userId) throw new Error("No hay sesión activa");
    const { data, error } = await supabase
      .from("profiles")
      .update(updates as any)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) throw error;
    if (!error && data) setProfile(data as Profile);
    return { data, error };
  };

  return { profile, loading, updateProfile, refetch };
}
