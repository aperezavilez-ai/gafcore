import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isGafcoreAdminUser } from "@/lib/gafcore-admin-role.server";

/** Solo usuarios con rol `admin` en `user_roles`. */
export const requireGafcoreAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const ok = await isGafcoreAdminUser(context.userId);
    if (!ok) {
      throw new Response("Forbidden: admin only", { status: 403 });
    }
    return next({ context });
  });
