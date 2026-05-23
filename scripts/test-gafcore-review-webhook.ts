#!/usr/bin/env node
/**
 * Envía un aviso de prueba al webhook de revisión del marketplace (si está configurado).
 *
 *   npm run gafcore:test-review-webhook
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildReviewWebhookBody } from "@/extensions/marketplace-review-notify.server";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFiles() {
  for (const name of [".env", ".env.development", ".env.local"]) {
    const p = resolve(root, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]?.trim()) process.env[k] = v;
    }
  }
}

async function main() {
  loadEnvFiles();

  const webhook = process.env.GAFCORE_MARKETPLACE_REVIEW_WEBHOOK_URL?.trim();
  if (!webhook) {
    console.log(
      "[webhook-test] GAFCORE_MARKETPLACE_REVIEW_WEBHOOK_URL no está definida.\n" +
        "  1. Crea un Incoming Webhook en Slack o Discord\n" +
        "  2. Añade la URL en .env.local:\n" +
        "     GAFCORE_MARKETPLACE_REVIEW_WEBHOOK_URL=https://hooks.slack.com/services/…\n" +
        "  3. Sube a Vercel: npm run gafcore:vercel-env\n" +
        "  4. Vuelve a ejecutar: npm run gafcore:test-review-webhook",
    );
    process.exit(0);
  }

  const payload = {
    type: "marketplace_listing_review",
    listingId: "00000000-0000-0000-0000-000000000099",
    slug: "smoke-test-listing",
    name: "Smoke test — revisión marketplace",
    kind: "template",
    creatorUserId: null,
    creatorLabel: "gafcore:smoke",
    adminUrl: "https://gafcore.com/gafcore/admin/marketplace",
    at: new Date().toISOString(),
    test: true,
  };

  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: buildReviewWebhookBody(webhook, payload),
  });

  console.log("[webhook-test] POST → HTTP", res.status);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[webhook-test] FAIL:", text.slice(0, 200));
    process.exit(1);
  }

  console.log("[webhook-test] OK — revisa Slack/Discord");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
