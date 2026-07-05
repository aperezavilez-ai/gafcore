#!/usr/bin/env node
/**
 * Prueba signIn contra Supabase (mismas credenciales que el login web).
 * Uso: GAFCORE_TEST_EMAIL=... GAFCORE_TEST_PASSWORD=... npm run gafcore:smoke-login
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(name) {
  const p = resolve(root, name);
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

for (const f of [".env", ".env.local", ".env.development"]) loadEnvFile(f);

const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
const key = (
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  ""
).trim();
const email = (process.env.GAFCORE_TEST_EMAIL || "alfonsoavilery@icloud.com").trim().toLowerCase();
const password = (process.env.GAFCORE_TEST_PASSWORD || "").trim();

const loginPage = readFileSync(resolve(root, "src/routes/gafcore_.login.tsx"), "utf8");
const loginShared = readFileSync(resolve(root, "src/lib/gafcore-login.shared.ts"), "utf8");

for (const [label, cond] of [
  ["form POST + preventDefault", loginPage.includes('method="post"') && loginPage.includes("preventDefault")],
  [
    "campos sin name email/password (anti-autofill)",
    loginPage.includes('name="gafcore_user"') && !loginPage.includes('name="password"'),
  ],
  ["gafcoreLoginWithPassword", loginPage.includes("gafcoreLoginWithPassword")],
  ["login redirect sin polling duplicado", !loginPage.includes("hydrateAuthFromStorage(4_000)")],
  ["login timeout guard", loginShared.includes("LOGIN_SIGN_IN_TIMEOUT_MS")],
  ["sin gafcore_email legacy", !loginPage.includes("gafcore_email")],
  ["@locked login.shared", loginShared.includes("@locked")],
]) {
  if (!cond) {
    console.error(`[smoke-login] FAIL estático: ${label}`);
    process.exit(1);
  }
  console.log(`[smoke-login] OK estático: ${label}`);
}

if (!url || !key) {
  console.log("[smoke-login] SKIP signIn: falta VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY local");
  process.exit(0);
}

if (!password) {
  console.log(
    "[smoke-login] SKIP signIn: define GAFCORE_TEST_PASSWORD en .env.local para probar signIn real",
  );
  process.exit(0);
}

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await sb.auth.signInWithPassword({ email, password });

if (error) {
  console.error(`[smoke-login] FAIL signIn (${email}):`, error.message);
  process.exit(1);
}

if (!data.session?.access_token) {
  console.error("[smoke-login] FAIL: signIn sin session");
  process.exit(1);
}

console.log(`[smoke-login] OK signIn: ${data.user?.email}`);
process.exit(0);
