/**
 * Marketplace / extensiones — handlers HTTP invocados desde `server.ts`
 * (evita HTTPError 500 de TanStack en Vercel).
 */
import { z } from "zod";
import { requireGafcoreApiUser } from "@/lib/gafcore-api-auth.server";
import { isGafcoreAdminUser } from "@/lib/gafcore-admin-role.server";
import { extensionsEnabled } from "@/extensions/extension-host.server";
import {
  installListingForUser,
  listPublishedCatalog,
  listUserExtensionInstalls,
  uninstallListingForUser,
} from "@/extensions/marketplace.server";
import { createExtensionCheckoutSession } from "@/extensions/marketplace-payments.server";
import { testUserAgentWebhook } from "@/extensions/external-agent.server";
import {
  ensurePublisherForUser,
  listAdminMarketplaceListings,
  listCreatorMarketplaceListings,
  setListingState,
  upsertListingFromManifest,
} from "@/extensions/publisher.server";
import type { StripeEnv } from "@/lib/stripe.server";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function extensionsDisabled(): Response {
  return json({ ok: false, error: "extensions_disabled" }, 503);
}

async function requireUser(request: Request): Promise<string | Response> {
  if (!extensionsEnabled()) return extensionsDisabled();
  return requireGafcoreApiUser(request);
}

async function requireAdmin(request: Request): Promise<string | Response> {
  const userId = await requireUser(request);
  if (userId instanceof Response) return userId;
  if (!(await isGafcoreAdminUser(userId))) {
    return json({ ok: false, error: "forbidden" }, 403);
  }
  return userId;
}

const kindSchema = z.enum(["template", "ai_plugin", "agent", "workflow_pack"]);

const CatalogBodySchema = z.object({
  kind: kindSchema.optional(),
});

/** POST /api/extensions/v1/catalog — catálogo con flags installed/purchased */
export async function handleExtensionsCatalogPost(request: Request): Promise<Response> {
  const userId = await requireUser(request);
  if (userId instanceof Response) return userId;

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text);
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = CatalogBodySchema.safeParse(body);
  if (!parsed.success) return json({ ok: false, error: "invalid_body" }, 400);

  const listings = await listPublishedCatalog(parsed.data.kind, userId);
  return json({ ok: true, listings });
}

const InstallBodySchema = z.object({
  listingId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
});

/** POST /api/extensions/v1/install */
export async function handleExtensionsInstallPost(request: Request): Promise<Response> {
  const userId = await requireUser(request);
  if (userId instanceof Response) return userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = InstallBodySchema.safeParse(body);
  if (!parsed.success) return json({ ok: false, error: "invalid_body" }, 400);

  const result = await installListingForUser(
    userId,
    parsed.data.listingId,
    parsed.data.projectId,
  );
  if (!result.ok) return json({ ok: false, error: result.error }, 400);
  return json({ ok: true, installSlug: result.installSlug });
}

/** POST /api/extensions/v1/uninstall */
export async function handleExtensionsUninstallPost(request: Request): Promise<Response> {
  const userId = await requireUser(request);
  if (userId instanceof Response) return userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = InstallBodySchema.pick({ listingId: true }).safeParse(body);
  if (!parsed.success) return json({ ok: false, error: "invalid_body" }, 400);

  const result = await uninstallListingForUser(userId, parsed.data.listingId);
  if (!result.ok) return json({ ok: false, error: result.error }, 400);
  return json({ ok: true });
}

/** POST /api/extensions/v1/installs */
export async function handleExtensionsInstallsPost(request: Request): Promise<Response> {
  const userId = await requireUser(request);
  if (userId instanceof Response) return userId;

  const installs = await listUserExtensionInstalls(userId);
  return json({ ok: true, installs });
}

const CheckoutBodySchema = z.object({
  listingId: z.string().uuid(),
  returnUrl: z.string().min(8).max(2048),
  environment: z.enum(["sandbox", "live"]),
  customerEmail: z.string().email().optional(),
});

/** POST /api/extensions/v1/checkout-session */
export async function handleExtensionsCheckoutSessionPost(request: Request): Promise<Response> {
  const userId = await requireUser(request);
  if (userId instanceof Response) return userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const parsed = CheckoutBodySchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid_body" }, 400);

  const result = await createExtensionCheckoutSession({
    userId,
    listingId: parsed.data.listingId,
    returnUrl: parsed.data.returnUrl,
    environment: parsed.data.environment as StripeEnv,
    customerEmail: parsed.data.customerEmail,
  });

  if (!result.ok) return json({ error: result.error }, 400);

  return json({
    client_secret: result.checkout.clientSecret,
    session_id: result.checkout.sessionId,
    amount_cents: result.checkout.amountCents,
    currency: result.checkout.currency,
  });
}

/** POST /api/extensions/v1/agent-test */
export async function handleExtensionsAgentTestPost(request: Request): Promise<Response> {
  const userId = await requireUser(request);
  if (userId instanceof Response) return userId;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = InstallBodySchema.pick({ listingId: true }).safeParse(body);
  if (!parsed.success) return json({ ok: false, error: "invalid_body" }, 400);

  const result = await testUserAgentWebhook(userId, parsed.data.listingId);
  if (!result.ok) return json({ ok: false, error: result.error }, 400);
  return json({ ok: true, status: result.status, body: result.body });
}

const publishSchema = z.object({
  publisherSlug: z.string().min(1).max(80).default("gafcore-labs"),
  listingSlug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(""),
  kind: z.enum(["template", "ai_plugin", "agent"]),
  versionLabel: z.string().min(1).max(32).default("1.0.0"),
  manifestJson: z.string().min(2).max(500_000),
  publish: z.boolean().default(true),
  priceCents: z.number().int().min(0).max(999_999).default(0),
  currency: z.string().min(3).max(3).default("eur"),
});

const stateSchema = z.object({
  listingId: z.string().uuid(),
  state: z.enum(["draft", "review", "published", "revoked"]),
});

/** POST /api/gafcore/marketplace/admin/listings */
export async function handleMarketplaceAdminListingsPost(request: Request): Promise<Response> {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const listings = await listAdminMarketplaceListings();
  return json({ ok: true, listings });
}

/** POST /api/gafcore/marketplace/admin/publish */
export async function handleMarketplaceAdminPublishPost(request: Request): Promise<Response> {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = publishSchema.safeParse(body);
  if (!parsed.success) return json({ ok: false, error: "invalid_body" }, 400);

  const result = await upsertListingFromManifest(parsed.data);
  if (!result.ok) return json({ ok: false, error: result.error }, 400);
  return json({ ok: true, listingId: result.listingId });
}

/** POST /api/gafcore/marketplace/admin/sync-builtin-templates */
export async function handleMarketplaceAdminSyncBuiltinPost(request: Request): Promise<Response> {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  const { syncBuiltinTemplatesToMarketplace } = await import(
    "@/extensions/marketplace-builtin-sync.server"
  );
  const result = await syncBuiltinTemplatesToMarketplace();
  if (!result.ok) return json({ ok: false, error: result.error }, 400);
  return json({
    ok: true,
    synced: result.synced,
    slugs: result.slugs,
    errors: result.errors,
  });
}

/** POST /api/gafcore/marketplace/admin/state */
export async function handleMarketplaceAdminStatePost(request: Request): Promise<Response> {
  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = stateSchema.safeParse(body);
  if (!parsed.success) return json({ ok: false, error: "invalid_body" }, 400);

  const result = await setListingState(parsed.data.listingId, parsed.data.state);
  if (!result.ok) return json({ ok: false, error: result.error }, 400);
  return json({ ok: true });
}

/** POST /api/gafcore/marketplace/publisher/me */
export async function handleMarketplacePublisherMePost(request: Request): Promise<Response> {
  const userId = await requireGafcoreApiUser(request);
  if (userId instanceof Response) return userId;
  if (!extensionsEnabled()) return extensionsDisabled();

  const result = await ensurePublisherForUser(userId);
  if (!result.ok) return json({ ok: false, error: result.error }, 400);
  return json({ ok: true, publisher: result.publisher });
}

/** POST /api/gafcore/marketplace/publisher/listings */
export async function handleMarketplacePublisherListingsPost(request: Request): Promise<Response> {
  const userId = await requireGafcoreApiUser(request);
  if (userId instanceof Response) return userId;
  if (!extensionsEnabled()) return extensionsDisabled();

  const listings = await listCreatorMarketplaceListings(userId);
  return json({ ok: true, listings });
}

const creatorPublishSchema = publishSchema.omit({ publisherSlug: true });

/** POST /api/gafcore/marketplace/publisher/submit */
export async function handleMarketplacePublisherSubmitPost(request: Request): Promise<Response> {
  const userId = await requireGafcoreApiUser(request);
  if (userId instanceof Response) return userId;
  if (!extensionsEnabled()) return extensionsDisabled();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = creatorPublishSchema.safeParse(body);
  if (!parsed.success) return json({ ok: false, error: "invalid_body" }, 400);

  const ensured = await ensurePublisherForUser(userId);
  if (!ensured.ok) return json({ ok: false, error: ensured.error }, 400);

  const result = await upsertListingFromManifest({
    publisherSlug: ensured.publisher.slug,
    listingSlug: parsed.data.listingSlug,
    name: parsed.data.name,
    description: parsed.data.description,
    kind: parsed.data.kind,
    versionLabel: parsed.data.versionLabel,
    manifestJson: parsed.data.manifestJson,
    publish: parsed.data.publish,
    creatorUserId: userId,
    priceCents: 0,
  });
  if (!result.ok) return json({ ok: false, error: result.error }, 400);
  return json({ ok: true, listingId: result.listingId, state: result.state });
}
