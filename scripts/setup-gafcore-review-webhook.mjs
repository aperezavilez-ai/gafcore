#!/usr/bin/env node
/**
 * Crea un webhook gratuito (webhook.site) y lo configura en Vercel para avisos
 * de revisión del marketplace. No requiere Slack ni Discord.
 *
 *   npm run gafcore:setup-review-webhook
 *   npm run gafcore:setup-review-webhook -- --vercel
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const withVercel = process.argv.includes("--vercel") || process.argv.includes("--push-vercel");

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

async function createWebhookSiteUrl() {
  const res = await fetch("https://webhook.site/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`webhook.site HTTP ${res.status}`);
  const data = await res.json();
  if (!data?.uuid) throw new Error("webhook.site no devolvió uuid");
  return {
    url: `https://webhook.site/${data.uuid}`,
    inbox: `https://webhook.site/#!/view/${data.uuid}`,
    expiresAt: data.expires_at ?? null,
  };
}

function pushVercelEnv(key, value) {
  console.log(`[setup-webhook] Vercel production → ${key}`);
  const r = spawnSync("npx", ["vercel@latest", "env", "add", key, "production", "--value", value, "--yes", "--force"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    windowsHide: true,
    env: process.env,
  });
  return r.status === 0;
}

async function sendTest(webhookUrl) {
  const payload = {
    type: "marketplace_listing_review",
    listingId: "00000000-0000-0000-0000-000000000099",
    slug: "setup-test",
    name: "GafCore — webhook configurado",
    kind: "template",
    creatorLabel: "gafcore:setup",
    adminUrl: "https://gafcore.com/gafcore/admin/marketplace",
    at: new Date().toISOString(),
    test: true,
  };
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.status;
}

async function main() {
  loadEnvFiles();

  let webhookUrl = process.env.GAFCORE_MARKETPLACE_REVIEW_WEBHOOK_URL?.trim();
  let inbox = null;
  let expiresAt = null;

  if (!webhookUrl) {
    console.log("[setup-webhook] Creando URL en webhook.site…");
    const created = await createWebhookSiteUrl();
    webhookUrl = created.url;
    inbox = created.inbox;
    expiresAt = created.expiresAt;
    console.log("[setup-webhook] URL:", webhookUrl);
  } else {
    const m = webhookUrl.match(/webhook\.site\/([a-f0-9-]+)/i);
    if (m?.[1]) inbox = `https://webhook.site/#!/view/${m[1]}`;
    console.log("[setup-webhook] Usando URL existente en entorno");
  }

  const testStatus = await sendTest(webhookUrl);
  console.log("[setup-webhook] Test POST → HTTP", testStatus);

  if (withVercel) {
    const whoami = spawnSync("npx", ["vercel@latest", "whoami"], {
      cwd: root,
      stdio: "pipe",
      shell: process.platform === "win32",
      windowsHide: true,
      encoding: "utf8",
      timeout: 30_000,
    });
    if (whoami.status !== 0) {
      console.warn("[setup-webhook] Vercel no autenticado. Ejecuta: npx vercel login");
    } else if (!pushVercelEnv("GAFCORE_MARKETPLACE_REVIEW_WEBHOOK_URL", webhookUrl)) {
      console.warn("[setup-webhook] No se pudo subir a Vercel (reintenta con --vercel)");
    } else {
      console.log("[setup-webhook] Variable subida a Vercel production");
    }
  }

  console.log(`
=== Webhook de revisión marketplace ===

  URL (Vercel / servidor):
    GAFCORE_MARKETPLACE_REVIEW_WEBHOOK_URL=${webhookUrl}

  Bandeja de entrada (abre en el navegador para ver avisos):
    ${inbox ?? webhookUrl}

${expiresAt ? `  Expira (webhook.site gratis): ${expiresAt}\n  Guárdala en tu cuenta webhook.site o migra a Discord/Slack antes.\n` : ""}
  Local: añade la variable en .env.local y reinicia dev.
  Prod: npm run gafcore:setup-review-webhook -- --vercel  (o redeploy tras cambiar env)
`);
}

main().catch((e) => {
  console.error("[setup-webhook]", e instanceof Error ? e.message : e);
  process.exit(1);
});
