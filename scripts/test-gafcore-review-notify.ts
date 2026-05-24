#!/usr/bin/env node
/**
 * Dispara un aviso de revisión marketplace (webhook + email si está configurado).
 *
 *   npm run gafcore:test-review-notify
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { notifyMarketplaceReviewSubmitted } from "@/extensions/marketplace-review-notify.server";

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
  if (!process.env.SUPABASE_URL?.trim() && process.env.VITE_SUPABASE_URL?.trim()) {
    process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL.trim();
  }
}

async function main() {
  loadEnvFiles();

  if (!process.env.SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    console.error("[test-notify] Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  console.log("[test-notify] Enviando aviso de prueba…");
  await notifyMarketplaceReviewSubmitted({
    listingId: "00000000-0000-0000-0000-000000000099",
    slug: "smoke-test-listing",
    name: "Smoke test — revisión marketplace",
    kind: "template",
  });
  console.log("[test-notify] OK — revisa webhook.site, correo admin o logs Vercel");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
