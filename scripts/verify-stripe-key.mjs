/**
 * Comprueba si STRIPE_SANDBOX_API_KEY del .env es válida (sin imprimir la clave).
 *   npm run gafcore:stripe-verify
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const env = { ...process.env };
for (const name of [".env", ".env.local"]) {
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

const secret = env.STRIPE_SANDBOX_API_KEY?.trim();
if (!secret) {
  console.error("Falta STRIPE_SANDBOX_API_KEY en .env");
  process.exit(1);
}

const suffix = secret.slice(-4);
console.log(`Prefijo: ${secret.slice(0, 8)}…  Sufijo: …${suffix}  Longitud: ${secret.length}`);

const res = await fetch("https://api.stripe.com/v1/balance", {
  headers: { Authorization: `Bearer ${secret}` },
});
const json = await res.json().catch(() => ({}));
if (res.ok) {
  console.log("\n✓ Clave válida. Puedes ejecutar: npm run gafcore:stripe-bootstrap\n");
  process.exit(0);
}

console.error("\n✗ Stripe rechazó la clave:", json?.error?.message || res.status);
console.error(
  "\nSolución: Stripe Dashboard → modo TEST → Developers → API keys → Secret key → Roll key → copia TODA la sk_test_ nueva en .env (sin comillas, una sola línea).\n",
);
process.exit(1);
