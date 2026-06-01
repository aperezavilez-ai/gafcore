/**
 * Diagnóstico local: variables necesarias para GafCore (Supabase + IA + pagos opcional).
 * No imprime valores secretos.
 *
 * Uso (raíz del proyecto):
 *   npm run gafcore:doctor
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

/** @type {Record<string, string>} */
const env = {};

function mergeEnvFile(name) {
  const p = resolve(root, name);
  if (!existsSync(p)) return;
  const raw = readFileSync(p, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    env[k] = v;
  }
}

// Mismo criterio que Vite: .env.local sobrescribe .env
for (const name of [".env", ".env.development", ".env.local"]) {
  mergeEnvFile(name);
}

function has(k) {
  const v = env[k];
  return typeof v === "string" && v.trim().length > 0;
}

function mask(k) {
  if (!has(k)) return "(vacío)";
  const v = env[k].trim();
  if (v.length <= 8) return "***";
  return `${v.slice(0, 4)}…${v.slice(-3)} (${v.length} caracteres)`;
}

function aiConfigured() {
  if (has("AI_CHAT_COMPLETIONS_URL") && has("AI_API_KEY")) return true;
  if (has("OPENROUTER_API_KEY")) return true;
  if (has("OPENAI_API_KEY")) return true;
  return false;
}

const issues = [];
const ok = [];

if (has("VITE_SUPABASE_URL")) {
  const u = env.VITE_SUPABASE_URL.trim();
  if (!u.startsWith("https://")) issues.push("VITE_SUPABASE_URL debe empezar por https://");
  else ok.push("VITE_SUPABASE_URL");
} else issues.push("Falta VITE_SUPABASE_URL");

if (has("VITE_SUPABASE_PUBLISHABLE_KEY")) ok.push("VITE_SUPABASE_PUBLISHABLE_KEY");
else if (has("VITE_SUPABASE_ANON_KEY")) ok.push("VITE_SUPABASE_ANON_KEY (alias de publishable)");
else issues.push("Falta VITE_SUPABASE_PUBLISHABLE_KEY o VITE_SUPABASE_ANON_KEY (clave anon del panel Supabase)");

if (has("SUPABASE_URL")) ok.push("SUPABASE_URL");
else if (has("VITE_SUPABASE_URL"))
  issues.push(
    "Falta SUPABASE_URL: el servidor no lee solo VITE_SUPABASE_URL; añade SUPABASE_URL con la misma URL https://….supabase.co",
  );
else issues.push("Falta SUPABASE_URL (servidor / webhooks)");

if (has("SUPABASE_SERVICE_ROLE_KEY")) ok.push("SUPABASE_SERVICE_ROLE_KEY");
else issues.push("Falta SUPABASE_SERVICE_ROLE_KEY (cliente admin en servidor)");

if (has("SUPABASE_PUBLISHABLE_KEY")) ok.push("SUPABASE_PUBLISHABLE_KEY (obligatoria para /api/* auth: getClaims)");
else
  issues.push(
    "Falta SUPABASE_PUBLISHABLE_KEY: el servidor la usa en rutas API (p. ej. chat/stream), distinta de VITE_. Copia el mismo valor que VITE_SUPABASE_PUBLISHABLE_KEY.",
  );

if (aiConfigured()) ok.push("IA: OPENAI_API_KEY u OPENROUTER_API_KEY o AI_CHAT_COMPLETIONS_URL+AI_API_KEY");
else
  issues.push(
    "Falta configuración de IA: define OPENAI_API_KEY, o OPENROUTER_API_KEY, o AI_CHAT_COMPLETIONS_URL + AI_API_KEY",
  );

if (has("VITE_PAYMENTS_CLIENT_TOKEN")) ok.push("VITE_PAYMENTS_CLIENT_TOKEN (Stripe publishable)");
else ok.push("VITE_PAYMENTS_CLIENT_TOKEN (opcional si aún no usas pagos en cliente)");

console.log("\n=== GafCore — diagnóstico de entorno (.env) ===\n");
console.log("Archivos leídos (si existen): .env, .env.development, .env.local\n");
for (const k of [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_PROJECT_ID",
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "AI_MODEL_FAST",
  "AI_MODEL_DEEP",
  "AI_MODEL_UI",
]) {
  console.log(`  ${k}: ${mask(k)}`);
}

if (has("VITE_PUBLIC_SITE_URL")) ok.push("VITE_PUBLIC_SITE_URL");
else
  console.log(
    "\n  ℹ Recomendado en Vercel: VITE_PUBLIC_SITE_URL=https://gafcore.com (enlaces de auth en correo).\n",
  );

if (issues.length === 0) {
  console.log("\n✓ Variables críticas presentes para Supabase + IA.\n");
  console.log("Automatizable: npm run gafcore:finish   (doctor + Stripe bootstrap)");
  console.log("Con Vercel CLI: npm run gafcore:finish -- --vercel\n");
  console.log("Manual (paneles):");
  console.log("  1. Supabase → Auth → URL Configuration + SMTP (remitente GafCore).");
  console.log("  2. npx supabase@latest db push  (migraciones).");
  console.log("  3. Prueba https://gafcore.com/gafcore/app y pago test Stripe.\n");

  const pay = has("VITE_PAYMENTS_CLIENT_TOKEN") ? env.VITE_PAYMENTS_CLIENT_TOKEN.trim() : "";
  if (pay.startsWith("pk_test_") || pay.startsWith("pk_live_")) {
    console.log("Stripe (cliente usa clave publicable pk_…):");
    if (pay.startsWith("pk_test_")) {
      if (!has("STRIPE_SANDBOX_API_KEY"))
        console.log("  ⚠ Falta STRIPE_SANDBOX_API_KEY (clave secreta sk_test_… de la misma cuenta).");
      else console.log("  ✓ STRIPE_SANDBOX_API_KEY presente");
      if (!has("PAYMENTS_SANDBOX_WEBHOOK_SECRET"))
        console.log("  ⚠ Falta PAYMENTS_SANDBOX_WEBHOOK_SECRET → los webhooks de test no verificarán firma.");
      else console.log("  ✓ PAYMENTS_SANDBOX_WEBHOOK_SECRET presente");
    }
    if (pay.startsWith("pk_live_")) {
      if (!has("STRIPE_LIVE_API_KEY"))
        console.log("  ⚠ Falta STRIPE_LIVE_API_KEY (clave secreta sk_live_… de la misma cuenta).");
      else console.log("  ✓ STRIPE_LIVE_API_KEY presente");
      if (!has("PAYMENTS_LIVE_WEBHOOK_SECRET"))
        console.log("  ⚠ Falta PAYMENTS_LIVE_WEBHOOK_SECRET → los webhooks live no verificarán firma.");
      else console.log("  ✓ PAYMENTS_LIVE_WEBHOOK_SECRET presente");
    }
    console.log(
      "  Webhook URL (Stripe Dashboard → Developers → Webhooks): POST tu origen público + /api/public/payments/webhook?env=sandbox o ?env=live",
    );
    console.log(
      "  Precios: lookup_key credits_pack_50 … credits_pack_1200 (pago único), o id price_… según payments.functions.\n",
    );
  }

  process.exit(0);
}

console.log("\n✗ Hay problemas:\n");
for (const m of issues) console.log(`  - ${m}`);
console.log("\nCorrige el .env en la raíz del proyecto, guarda y vuelve a ejecutar: npm run gafcore:doctor\n");
process.exit(1);
