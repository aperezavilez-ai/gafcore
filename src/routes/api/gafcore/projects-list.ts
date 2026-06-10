import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createClient } from "@supabase/supabase-js";

async function getUserIdFromRequest(request: Request): Promise<string | null> {
  // Intentar con Bearer token
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
      if (url && key) {
        const sb = createClient(url, key, { auth: { persistSession: false } });
        const { data } = await sb.auth.getUser(token);
        if (data.user?.id) return data.user.id;
      }
    }
  }
  // Intentar con cookie de sesión de Supabase
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(/sb-[^-]+-auth-token(?:\.0)?=([^;]+)/);
  if (match) {
    try {
      const decoded = decodeURIComponent(match[1]);
      const parsed = JSON.parse(decoded);
      const token = parsed.access_token ?? parsed?.[0]?.access_token;
      if (token) {
        const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
        if (url && key) {
          const sb = createClient(url, key, { auth: { persistSession: false } });
          const { data } = await sb.auth.getUser(token);
          if (data.user?.id) return data.user.id;
        }
      }
    } catch {}
  }
  return null;
}

export const Route = createFileRoute("/api/gafcore/projects-list")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const userId = await getUserIdFromRequest(request);
        if (!userId) {
          return json({ ok: false, error: "unauthorized" }, 401);
        }

        const { data, error } = await supabaseAdmin
          .from("projects")
          .select("id, name, created_at, updated_at, deploy_site_url, github_repo")
          .eq("user_id", userId)
          .order("updated_at", { ascending: false, nullsFirst: false });

        if (error) {
          return json({ ok: false, error: error.message }, 500);
        }

        return json({ ok: true, projects: data ?? [] });
      },
    },
  },
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
