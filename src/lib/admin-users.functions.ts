import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type AuthUserLite = {
  id: string;
  last_sign_in_at?: string | null;
};

async function listAllAuthUsers(): Promise<AuthUserLite[]> {
  const users: AuthUserLite[] = [];
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const batch = (data?.users ?? []).map((u) => ({
      id: u.id,
      last_sign_in_at: (u as { last_sign_in_at?: string | null }).last_sign_in_at ?? null,
    }));
    users.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
  }
  return users;
}

export const getUserStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    // Verify caller is admin
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleRow) {
      throw new Error("forbidden");
    }

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Exclude admins (and any cuenta interna/de prueba marcada como admin) del conteo.
    const { data: adminRows } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const adminIds = new Set((adminRows ?? []).map((r: { user_id: string }) => r.user_id));

    const [profilesRes, activeRows, authUsers] = await Promise.all([
      supabaseAdmin.from("profiles").select("user_id, email"),
      supabaseAdmin
        .from("credit_transactions")
        .select("user_id")
        .gte("created_at", since24h),
      listAllAuthUsers(),
    ]);

    // Solo cuentan usuarios reales: existen en profiles, no son admin,
    // y tienen email válido (descarta cuentas demo/test sin email o con
    // dominios de prueba como demo@, test@, +test@, ejemplo@, etc.)
    const TEST_EMAIL_RE = /(^|[+.@])(demo|test|qa|prueba|ejemplo|example)\b|@(example|test|mailinator|tempmail)\./i;
    const realProfileIds = new Set(
      (profilesRes.data ?? [])
        .filter((r: { user_id: string; email: string | null }) =>
          r.user_id &&
          !adminIds.has(r.user_id) &&
          r.email &&
          !TEST_EMAIL_RE.test(r.email),
        )
        .map((r: { user_id: string }) => r.user_id),
    );

    const realUserFilter = (id: string) => realProfileIds.has(id);

    const registered = realProfileIds.size;
    const connectedWindowMs = 30 * 60 * 1000; // 30 min
    const now = Date.now();
    const connectedSet = new Set(
      authUsers
        .filter((u) => {
          if (!realUserFilter(u.id) || !u.last_sign_in_at) return false;
          const t = new Date(u.last_sign_in_at).getTime();
          return Number.isFinite(t) && now - t <= connectedWindowMs;
        })
        .map((u) => u.id),
    );
    const activeSet = new Set(
      (activeRows.data ?? [])
        .map((r: { user_id: string }) => r.user_id)
        .filter(realUserFilter),
    );

    return {
      registered,
      connected: connectedSet.size,
      active24h: activeSet.size,
    };
  });
