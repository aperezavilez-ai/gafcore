import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DEFAULT_OWNER_EMAIL = "alfonsoavilery@icloud.com";

function ownerAdminEmails(): Set<string> {
  const configured = process.env.GAFCORE_ADMIN_EMAILS || process.env.GAFCORE_ADMIN_EMAIL || "";
  return new Set(
    [DEFAULT_OWNER_EMAIL, ...configured.split(",")]
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function ensureOwnerAdminAccess(userId: string, email: string): Promise<boolean> {
  if (!ownerAdminEmails().has(email.trim().toLowerCase())) return false;

  await supabaseAdmin
    .from("user_roles")
    .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });

  await supabaseAdmin.from("profiles").upsert(
    { user_id: userId, email },
    { onConflict: "user_id" },
  );

  const { data: credits } = await supabaseAdmin
    .from("user_credits")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();

  await supabaseAdmin.from("user_credits").upsert(
    {
      user_id: userId,
      balance: Math.max(Number(credits?.balance ?? 0), 1000),
      monthly_allowance: 1000,
      daily_limit: 1000,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  return true;
}

/** Rol `admin` en `user_roles` (servidor; usa service role). */
export async function isGafcoreAdminUser(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!error && data) return true;

  const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = userData?.user?.email;
  if (!email) return false;
  return ensureOwnerAdminAccess(userId, email);
}
