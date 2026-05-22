import { createFileRoute } from "@tanstack/react-router";
import { listPublishedCatalog } from "@/extensions/marketplace.server";
import { extensionsEnabled } from "@/extensions/extension-host.server";

export const Route = createFileRoute("/api/extensions/v1/catalog")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!extensionsEnabled()) {
          return Response.json({ ok: false, error: "extensions_disabled" }, { status: 503 });
        }
        const url = new URL(request.url);
        const kind = url.searchParams.get("kind") ?? undefined;
        const listings = await listPublishedCatalog(kind || undefined);
        return Response.json({ ok: true, listings });
      },
    },
  },
});
