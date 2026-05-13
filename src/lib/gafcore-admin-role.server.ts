import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Rol `admin` en `user_roles` (servidor; usa service role). */
export async function isGafcoreAdminUser(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) return false;
  return !!data;
}
