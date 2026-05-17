/**
 * Cierra el setup automatizable de GafCore (local + opcional Vercel).
 * No lee ni imprime secretos.
 *
 *   npm run gafcore:finish
 *   npm run gafcore:finish -- --vercel   (sube .env / .env.local a Vercel)
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const withVercel = process.argv.includes("--vercel");

function envHas(key) {
  for (const name of [".env.local", ".env"]) {
    const p = resolve(root, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      if (t.slice(0, eq).trim() === key && t.slice(eq + 1).trim()) return true;
    }
  }
  return false;
}

function run(label, cmd, args) {
  console.log(`\n--- ${label} ---\n`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: true, env: process.env });
  return r.status === 0;
}

console.log("\n=== GafCore — finalizar setup ===\n");

const doctorOk = run("Diagnóstico", "node", ["scripts/check-gafcore-setup.mjs"]);
if (!doctorOk) {
  console.log("\nCorrige .env / .env.local y vuelve a ejecutar: npm run gafcore:finish\n");
  process.exit(1);
}

if (envHas("STRIPE_SANDBOX_API_KEY")) {
  run("Stripe catálogo (test)", "node", ["scripts/bootstrap-stripe-gafcore.mjs"]);
} else {
  console.log("\n(Omitido Stripe bootstrap: añade STRIPE_SANDBOX_API_KEY=sk_test_…)\n");
}

if (withVercel) {
  const vercelOk = run("Vercel login", "npx", ["vercel@latest", "whoami"]);
  if (vercelOk) {
    run("Variables en Vercel", "node", ["scripts/push-vercel-env-once.mjs"]);
  } else {
    console.log("Ejecuta: npx vercel login   y luego: npm run gafcore:finish -- --vercel\n");
  }
}

console.log(`
--- Solo tú en el panel (no automatizable desde aquí) ---

  Supabase → Authentication → URL Configuration
    Site URL: https://gafcore.com
    Redirects: https://gafcore.com/** , http://127.0.0.1:8080/**

  Supabase → Authentication → SMTP (remitente "GafCore")

  Terminal (con Supabase CLI enlazado):
    npx supabase@latest link --project-ref hbfbqqwetaynblmkezeu
    npx supabase@latest config push
    npx supabase@latest db push

  Vercel → redeploy tras cambiar env (o npm run gafcore:finish -- --vercel)

  Prueba: https://gafcore.com/gafcore/app → chat IA + pago test 4242…

Listo en repo. Cuando SMTP y db push estén hechos, GafCore queda operativo en test.
`);
