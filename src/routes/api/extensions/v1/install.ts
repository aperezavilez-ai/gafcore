import { createFileRoute } from "@tanstack/react-router";
import { installListingForUser } from "@/extensions/marketplace.server";
import { extensionsEnabled } from "@/extensions/extension-host.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function userIdFromRequest(request: Request): Promise<string | null> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

export const Route = createFileRoute("/api/extensions/v1/install")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!extensionsEnabled()) {
          return Response.json({ ok: false, error: "extensions_disabled" }, { status: 503 });
        }
        const userId = await userIdFromRequest(request);
        if (!userId) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }
        let body: { listingId?: string; projectId?: string };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
        }
        if (!body.listingId) {
          return Response.json({ ok: false, error: "listingId_required" }, { status: 400 });
        }
        const result = await installListingForUser(userId, body.listingId, body.projectId);
        if (!result.ok) {
          return Response.json({ ok: false, error: result.error }, { status: 400 });
        }
        return Response.json({ ok: true, installSlug: result.installSlug });
      },
    },
  },
});
