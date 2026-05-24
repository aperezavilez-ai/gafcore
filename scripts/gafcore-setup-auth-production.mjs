#!/usr/bin/env node
/**
 * Auth + DB + webhook de revisión en producción (Supabase enlazado + Vercel CLI).
 *
 *   npm run gafcore:setup-auth-production
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(label, cmd, args, opts = {}) {
  console.log(`\n--- ${label} ---\n`);
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    windowsHide: true,
    ...opts,
  });
  return r.status ?? 1;
}

console.log("\n=== GafCore — setup auth / migraciones / webhook ===\n");

const link = run("Supabase link (proyecto GafCore prod)", "npx", [
  "supabase@latest",
  "link",
  "--project-ref",
  "hbfbqqwetaynblmkezeu",
  "--yes",
]);
if (link !== 0) {
  console.warn(
    "[setup-auth] Link falló. En tu terminal:\n  npx supabase login\n  npx supabase link --project-ref hbfbqqwetaynblmkezeu\n",
  );
}

const config = run("Supabase config push (Auth URLs + plantillas email)", "npx", [
  "supabase@latest",
  "config",
  "push",
  "--yes",
]);
if (config !== 0) {
  console.warn("[setup-auth] config push falló — revisa Supabase Dashboard → Auth");
}

const db = run("Supabase db push (migraciones)", "npx", [
  "supabase@latest",
  "db",
  "push",
  "--linked",
  "--yes",
]);
if (db !== 0) {
  console.warn("[setup-auth] db push falló — aplica SQL manual en el panel si hace falta");
}

run("Webhook revisión marketplace → Vercel", "npm", [
  "run",
  "gafcore:setup-review-webhook",
  "--",
  "--vercel",
]);

console.log(`
--- SMTP / correo transaccional (panel Supabase) ---

  Supabase → Project hbfbqqwetaynblmkezeu → Authentication → SMTP
    Host: smtp.resend.com (Resend) o tu proveedor
    Port: 465 / 587
    User: resend
    Sender email: noreply@tudominio.com (dominio verificado)
    Sender name: GafCore

  Alternativa sin SMTP Supabase: añade en Vercel
    RESEND_API_KEY=re_…
    RESEND_FROM=GafCore <noreply@tudominio.com>

  Prueba aviso revisión: npm run gafcore:test-review-notify

Listo. Redeploy Vercel si cambiaste env (npx vercel deploy --prod --yes).
`);
