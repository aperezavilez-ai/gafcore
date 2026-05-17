/**
 * Crea en Stripe productos/precios con lookup_key que espera GafCore.
 * Precios provisionales (ajusta después en Stripe Dashboard).
 *
 * Uso:
 *   STRIPE_SANDBOX_API_KEY=sk_test_... npm run gafcore:stripe-bootstrap
 *   STRIPE_LIVE_API_KEY=sk_live_... npm run gafcore:stripe-bootstrap -- --live
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const live = process.argv.includes("--live");

function loadEnv() {
  /** Archivos del repo tienen prioridad sobre variables viejas en la sesión de PowerShell. */
  const env = { ...process.env };
  for (const name of [".env", ".env.local", ".env.development"]) {
    const p = resolve(root, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      if (v) env[k] = v;
    }
  }
  return env;
}

const env = loadEnv();
const secret = live
  ? env.STRIPE_LIVE_API_KEY?.trim()
  : env.STRIPE_SANDBOX_API_KEY?.trim();

if (!secret) {
  console.error(
    live
      ? "Falta STRIPE_LIVE_API_KEY en .env.local"
      : "Falta STRIPE_SANDBOX_API_KEY en .env.local",
  );
  process.exit(1);
}

const SUBSCRIPTION_PLANS = [
  { lookup_key: "plan_basico_monthly", name: "GafCore Starter", amount: 1900 },
  { lookup_key: "plan_pro_monthly", name: "GafCore Creator", amount: 4900 },
  { lookup_key: "plan_premium_monthly", name: "GafCore Pro", amount: 9900 },
  { lookup_key: "plan_creador_monthly", name: "GafCore Label", amount: 29900 },
];

/** Misma rejilla que CreditsOutModal: 50…1200 créditos, $10 por cada 50. */
const CREDIT_PACKS = Array.from({ length: 24 }, (_, i) => {
  const credits = (i + 1) * 50;
  return {
    lookup_key: `credits_pack_${credits}`,
    name: `GafCore ${credits} créditos`,
    amount: (i + 1) * 1000,
  };
});

async function stripe(path, body) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error?.message || `Stripe ${res.status}`);
  }
  return json;
}

async function priceExists(lookupKey) {
  const q = new URLSearchParams();
  q.set("lookup_keys[0]", lookupKey);
  q.set("limit", "1");
  const data = await stripe(`/prices?${q}`);
  return Array.isArray(data.data) && data.data.length > 0 ? data.data[0] : null;
}

async function ensureRecurringPrice({ lookup_key, name, amount }) {
  const existing = await priceExists(lookup_key);
  if (existing) {
    console.log(`  ✓ ${lookup_key} ya existe (${existing.id})`);
    return existing;
  }
  const created = await stripe("/prices", {
    currency: "usd",
    unit_amount: String(amount),
    "recurring[interval]": "month",
    lookup_key,
    "product_data[name]": name,
    "metadata[gafcore_price_id]": lookup_key,
  });
  console.log(`  + ${lookup_key} → ${created.id} ($${(amount / 100).toFixed(2)}/mes)`);
  return created;
}

async function ensureOneTimePrice({ lookup_key, name, amount }) {
  const existing = await priceExists(lookup_key);
  if (existing) {
    console.log(`  ✓ ${lookup_key} ya existe (${existing.id})`);
    return existing;
  }
  const created = await stripe("/prices", {
    currency: "usd",
    unit_amount: String(amount),
    lookup_key,
    "product_data[name]": name,
    "metadata[gafcore_price_id]": lookup_key,
  });
  console.log(`  + ${lookup_key} → ${created.id} ($${(amount / 100).toFixed(2)} pago único)`);
  return created;
}

console.log(`\n=== GafCore — bootstrap Stripe (${live ? "LIVE" : "TEST"}) ===\n`);
const mode = secret.startsWith("sk_test_")
  ? "sk_test_"
  : secret.startsWith("sk_live_")
    ? "sk_live_"
    : "desconocido";
console.log(`Clave secreta: ${mode} (${secret.length} caracteres, desde .env)\n`);
if (!live && !secret.startsWith("sk_test_")) {
  console.error("En sandbox usa STRIPE_SANDBOX_API_KEY=sk_test_… (modo Test en Stripe Dashboard).");
  process.exit(1);
}

console.log("Planes (suscripción mensual):");
for (const p of SUBSCRIPTION_PLANS) {
  await ensureRecurringPrice(p);
}

console.log("\nPaquetes de créditos (pago único):");
for (const p of CREDIT_PACKS) {
  await ensureOneTimePrice(p);
}

console.log(`
Siguiente paso manual:
  1. Stripe → Webhooks → endpoint:
     https://gafcore.com/api/public/payments/webhook?env=${live ? "live" : "sandbox"}
  2. Copia whsec_… a Vercel: PAYMENTS_${live ? "LIVE" : "SANDBOX"}_WEBHOOK_SECRET
  3. pk_${live ? "live" : "test"}_… → VITE_PAYMENTS_CLIENT_TOKEN
`);
