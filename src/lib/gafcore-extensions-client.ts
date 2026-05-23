import { gafcoreAuthJsonFetch } from "@/lib/gafcore-client-auth-fetch";
import type { CatalogListing, UserExtensionInstall } from "@/extensions/marketplace.server";
import type { AdminListingRow } from "@/extensions/publisher.server";

export async function fetchExtensionsCatalog(kind?: string) {
  return gafcoreAuthJsonFetch<{ ok: boolean; listings?: CatalogListing[]; error?: string }>(
    "/api/extensions/v1/catalog",
    kind ? { kind } : {},
  );
}

export async function installExtension(listingId: string, projectId?: string) {
  return gafcoreAuthJsonFetch<{ ok: boolean; installSlug?: string; error?: string }>(
    "/api/extensions/v1/install",
    { listingId, ...(projectId ? { projectId } : {}) },
  );
}

export async function uninstallExtension(listingId: string) {
  return gafcoreAuthJsonFetch<{ ok: boolean; error?: string }>("/api/extensions/v1/uninstall", {
    listingId,
  });
}

export async function fetchUserExtensionInstalls() {
  return gafcoreAuthJsonFetch<{ ok: boolean; installs?: UserExtensionInstall[]; error?: string }>(
    "/api/extensions/v1/installs",
    {},
  );
}

export async function testExtensionAgent(listingId: string) {
  return gafcoreAuthJsonFetch<{ ok: boolean; status?: number; body?: unknown; error?: string }>(
    "/api/extensions/v1/agent-test",
    { listingId },
  );
}

export async function fetchAdminMarketplaceListings() {
  return gafcoreAuthJsonFetch<{ ok: boolean; listings?: AdminListingRow[]; error?: string }>(
    "/api/gafcore/marketplace/admin/listings",
    {},
  );
}

export async function publishAdminMarketplaceListing(data: {
  publisherSlug: string;
  listingSlug: string;
  name: string;
  description: string;
  kind: "template" | "ai_plugin" | "agent";
  versionLabel: string;
  manifestJson: string;
  publish: boolean;
  priceCents: number;
  currency: string;
}) {
  return gafcoreAuthJsonFetch<{ ok: boolean; listingId?: string; error?: string }>(
    "/api/gafcore/marketplace/admin/publish",
    data,
  );
}

export async function setAdminMarketplaceListingState(
  listingId: string,
  state: "draft" | "review" | "published" | "revoked",
) {
  return gafcoreAuthJsonFetch<{ ok: boolean; error?: string }>(
    "/api/gafcore/marketplace/admin/state",
    { listingId, state },
  );
}

export async function fetchMyPublisherProfile() {
  return gafcoreAuthJsonFetch<{
    ok: boolean;
    publisher?: { slug: string; display_name: string };
    error?: string;
  }>("/api/gafcore/marketplace/publisher/me", {});
}

export async function fetchMyPublisherListings() {
  return gafcoreAuthJsonFetch<{ ok: boolean; listings?: AdminListingRow[]; error?: string }>(
    "/api/gafcore/marketplace/publisher/listings",
    {},
  );
}

export async function submitCreatorMarketplaceListing(data: {
  listingSlug: string;
  name: string;
  description: string;
  kind: "template" | "ai_plugin" | "agent";
  versionLabel: string;
  manifestJson: string;
  publish: boolean;
}) {
  return gafcoreAuthJsonFetch<{
    ok: boolean;
    listingId?: string;
    state?: string;
    error?: string;
  }>("/api/gafcore/marketplace/publisher/submit", data);
}
