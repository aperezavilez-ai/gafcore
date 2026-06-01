#!/usr/bin/env node
/**
 * Comprueba que lo crítico sigue blindado (login URL, cerebro V2, env).
 * Ejecutar antes y después de cualquier cambio en auth o chat IDE:
 *   npm run gafcore:stability
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  const p = resolve(root, rel);
  if (!existsSync(p)) throw new Error(`Falta archivo: ${rel}`);
  return readFileSync(p, "utf8");
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`[stability] FAIL: ${msg}`);
    process.exitCode = 1;
    return false;
  }
  console.log(`[stability] OK: ${msg}`);
  return true;
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, shell: true, stdio: "inherit" });
  return r.status === 0;
}

console.log("=== GafCore stability gate ===\n");

const loginPage = read("src/routes/gafcore_.login.tsx");
const loginShared = read("src/lib/gafcore-login.shared.ts");
const rootTsx = read("src/routes/__root.tsx");
const autofix = read("src/lib/gafcore-chat-autofix.shared.ts");
const register = read("src/routes/gafcore_.register.tsx");

assert(loginShared.includes("@locked"), "gafcore-login.shared marcado @locked");
assert(loginShared.includes("GAFCORE_LOGIN_URL_STRIP_SCRIPT"), "script anti-URL en login.shared");
assert(
  loginPage.includes('method="post"') && loginPage.includes("e.preventDefault()"),
  "login: form POST + preventDefault (no GET con contraseña en URL)",
);
assert(
  loginPage.includes('name="gafcore_user"') && loginPage.includes('name="gafcore_secret"'),
  "login: nombres de campo sin autofill Chrome (gafcore_user/secret)",
);
assert(
  !loginPage.includes("GAFCORE_LOGIN_CLEAR_FIELDS_SCRIPT"),
  "login: sin script que borre campos al escribir",
);
assert(
  loginShared.includes("fallback.email.trim() || domEmail"),
  "login: lee credenciales del estado React primero",
);
const supabaseBrowser = read("src/lib/gafcore-supabase-browser.ts");
assert(
  supabaseBrowser.includes("resolveSupabaseCreateClient") &&
    supabaseBrowser.includes("assertGafcoreSupabaseClient"),
  "supabase browser: createClient defensivo + assert",
);
assert(loginPage.includes("hydrateAuthFromStorage"), "login: hidrata sesión antes del redirect");
assert(!loginPage.includes("inputsReady"), "login: sin variable inputsReady rota (pantalla negra)");
assert(!loginPage.includes("gafcore_email"), "login: sin name gafcore_email (legacy)");
assert(!register.includes("clearCredentialFields"), "register: sin referencia rota a clearCredentialFields");
assert(rootTsx.includes("GAFCORE_LOGIN_URL_STRIP_SCRIPT"), "root: script limpia URL antes de React");
assert(
  rootTsx.includes("GAFCORE_WEB_ONLY_HEAD_SCRIPT") && !existsSync(resolve(root, "public/manifest.webmanifest")),
  "solo web: sin manifest PWA y script anti-SW en head",
);
assert(!rootTsx.includes("apple-touch-icon"), "root: sin apple-touch-icon (evita «Abrir en la app»)");
assert(
  autofix.includes("isPreviewAutofixAiEnabled") && autofix.includes("GAFCORE_AUTOFIX_SESSION_MAX = 2"),
  "autofix preview: desactivado por defecto, máx 2 si activo",
);

assert(
  register.includes("getGafcoreSupabaseBrowser") && !register.includes("clearCredentialFields"),
  "register: cliente Supabase unificado, sin referencia rota",
);

console.log("\n--- doctor ---");
if (!run("npm", ["run", "gafcore:doctor"])) process.exitCode = 1;

console.log("\n--- smoke brain v2 ---");
if (!run("npm", ["run", "gafcore:smoke-brain-v2"])) process.exitCode = 1;

if (process.exitCode) {
  console.error("\n[stability] ALGUNA COMPROBACIÓN FALLÓ. No desplegar.");
  process.exit(1);
}
console.log("\n[stability] Todas las comprobaciones pasaron.");
