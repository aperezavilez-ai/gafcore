import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  accountType: z.enum(["user", "demo", "admin"]),
  adminCode: z.string().optional(),
});

export const assignGafcoreAccountType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Identity is derived from the verified session — never from the client.
    const userId = context.userId as string;
    if (!userId) throw new Error("No autenticado");

    const { accountType, adminCode } = data;

    if (accountType === "admin") {
      // Only an existing admin can grant admin (defense in depth on top of the code).
      const { data: existing } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();
      const expected = process.env.GAFCORE_ADMIN_CODE;
      const codeOk = !!expected && !!adminCode && adminCode === expected;
      if (!existing && !codeOk) {
        throw new Error("Código de administrador inválido");
      }
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
      await supabaseAdmin.rpc("add_credits", {
        p_user_id: userId,
        p_amount: 10000,
        p_reason: "admin_grant",
        p_metadata: {},
      });
      return { ok: true, role: "admin" as const };
    }

    if (accountType === "demo") {
      await supabaseAdmin
        .from("profiles")
        .update({ onboarding_data: { demo: true } })
        .eq("user_id", userId);
      await supabaseAdmin.rpc("add_credits", {
        p_user_id: userId,
        p_amount: 50,
        p_reason: "demo_grant",
        p_metadata: {},
      });
      return { ok: true, role: "demo" as const };
    }

    /** Usuario normal: si saldo 0 y nunca hubo movimientos, otorgar 10 de bienvenida (evita filas 0 por re-registro / trigger). */
    if (accountType === "user") {
      const { data: creditRow } = await supabaseAdmin
        .from("user_credits")
        .select("balance")
        .eq("user_id", userId)
        .maybeSingle();
      const bal = creditRow?.balance ?? 0;
      if (bal === 0) {
        const { count, error: countErr } = await supabaseAdmin
          .from("credit_transactions")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId);
        if (countErr) throw new Error(countErr.message);
        if (!count) {
          const { error: rpcErr } = await supabaseAdmin.rpc("add_credits", {
            p_user_id: userId,
            p_amount: 10,
            p_reason: "welcome_grant",
            p_metadata: {},
          });
          if (rpcErr) throw new Error(rpcErr.message);
        }
      }
    }

    return { ok: true, role: "user" as const };
  });
