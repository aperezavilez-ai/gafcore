#!/usr/bin/env node
/**
 * Aplica migración marketplace/extensiones (E1) al proyecto Supabase enlazado.
 *
 * Uso: npm run gafcore:migrate-extensions
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migration = "20260531120000_gafcore_extensions.sql";

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    // Ruta relativa en -f (sin espacios). shell en Windows para que npx arranque.
    shell: process.platform === "win32",
    windowsHide: true,
    ...opts,
  });
  return r.status ?? 1;
}

const sqlPath = join("supabase", "migrations", migration);
const p = join(root, sqlPath);
if (!existsSync(p)) {
  console.error(`[gafcore] Falta archivo: ${p}`);
  process.exit(1);
}

console.log(`[gafcore] Migración extensiones: ${migration}`);
const query = run("npx", ["supabase@latest", "db", "query", "--linked", "-f", sqlPath]);
if (query !== 0) {
  console.error(`
[gafcore] Falló. Alternativa manual:
  Supabase Dashboard → SQL Editor → ejecutar:
  supabase/migrations/${migration}
`);
  process.exit(query);
}

console.log("[gafcore] Migración extensiones aplicada.");
