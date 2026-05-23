#!/usr/bin/env node
/**
 * Smoke test marketplace en producción o local.
 * Uso: npm run gafcore:smoke-extensions
 *      GAFCORE_SMOKE_BASE=https://gafcore.com npm run gafcore:smoke-extensions
 */
const base = (process.env.GAFCORE_SMOKE_BASE ?? "https://gafcore.com").replace(/\/$/, "");

async function getJson(path) {
  const res = await fetch(`${base}${path}`);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${path} → HTTP ${res.status}, no JSON`);
  }
  return { status: res.status, body };
}

let failed = false;

const diag = await getJson("/api/__extensions-diag");
console.log("[smoke] diag:", diag.body);
if (!diag.body?.ok || (diag.body.publishedCount ?? 0) < 1) {
  console.error("[smoke] FAIL: publishedCount debe ser >= 1");
  failed = true;
}

const catalog = await getJson("/api/extensions/v1/catalog");
console.log("[smoke] catalog listings:", catalog.body?.listings?.length ?? 0);
if (!catalog.body?.ok || !Array.isArray(catalog.body.listings) || catalog.body.listings.length < 1) {
  console.error("[smoke] FAIL: catálogo vacío o error");
  failed = true;
}

const installProbe = await fetch(`${base}/api/extensions/v1/install`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ listingId: "00000000-0000-0000-0000-000000000001" }),
});
const installStatus = installProbe.status;
console.log("[smoke] install sin auth HTTP:", installStatus);
if (installStatus === 500) {
  console.error("[smoke] FAIL: install devuelve 500 (HTTPError Vercel)");
  failed = true;
}

process.exit(failed ? 1 : 0);
