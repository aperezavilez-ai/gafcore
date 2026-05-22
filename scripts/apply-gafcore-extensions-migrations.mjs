#!/usr/bin/env node
/**
 * Aplica migraciones marketplace/extensiones al proyecto Supabase enlazado.
 *
 * Uso: npm run gafcore:migrate-extensions
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrations = [
  "20260531120000_gafcore_extensions.sql",
  "20260531130000_gafcore_extensions_catalog_seed.sql",
];

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    windowsHide: true,
    ...opts,
  });
  return r.status ?? 1;
}

for (const migration of migrations) {
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
[gafcore] Falló en ${migration}. Alternativa manual:
  Supabase Dashboard → SQL Editor → ejecutar:
  supabase/migrations/${migration}
`);
    process.exit(query);
  }
}

console.log("[gafcore] Migraciones extensiones aplicadas.");
