#!/usr/bin/env node
/**
 * Sube RESEND_API_KEY y RESEND_FROM desde .env.local a Vercel production.
 * Añade primero las claves en .env.local (desde resend.com), luego:
 *
 *   npm run gafcore:vercel-resend
 */
import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const keys = ["RESEND_API_KEY", "RESEND_FROM", "GAFCORE_EMAIL_FROM"];

function loadEnv() {
  const out = {};
  for (const name of [".env.local", ".env"]) {
    const p = join(root, name);
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
      if (v) out[k] = v;
    }
  }
  return out;
}

const env = loadEnv();
const toPush = keys.filter((k) => env[k]?.trim());

if (!toPush.length) {
  console.log(`
[gafcore] No hay RESEND en .env.local.

  1. Crea API key en https://resend.com/api-keys
  2. Añade en .env.local:
     RESEND_API_KEY=re_…
     RESEND_FROM=GafCore <noreply@send.gafcore.com>
  3. Vuelve a ejecutar: npm run gafcore:vercel-resend
`);
  process.exit(1);
}

for (const key of toPush) {
  console.log(`[gafcore] Vercel production → ${key}`);
  const vercelArgs = ["vercel@latest", "env", "add", key, "production", "--value", env[key], "--yes", "--force"];
  const r = spawnSync("npx", vercelArgs, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    windowsHide: true,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log("\n[gafcore] Resend en Vercel. Redeploy: npx vercel deploy --prod --yes");
console.log("Prueba: npm run gafcore:test-review-notify\n");
