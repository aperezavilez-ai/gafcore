import { createFileRoute } from "@tanstack/react-router";
import { getListingManifest } from "@/extensions/marketplace.server";
import { extensionsEnabled } from "@/extensions/extension-host.server";

export const Route = createFileRoute("/api/extensions/v1/manifest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!extensionsEnabled()) {
          return Response.json({ ok: false, error: "extensions_disabled" }, { status: 503 });
        }
        const listingId = new URL(request.url).searchParams.get("listingId");
        if (!listingId) {
          return Response.json({ ok: false, error: "listingId_required" }, { status: 400 });
        }
        const pack = await getListingManifest(listingId);
        if (!pack) return Response.json({ ok: false, error: "not_found" }, { status: 404 });
        return Response.json({ ok: true, ...pack });
      },
    },
  },
});
