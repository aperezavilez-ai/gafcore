#!/usr/bin/env node
/**
 * Aplica migraciones workflow (pipeline + agent tasks + claim RPC) al proyecto Supabase enlazado.
 *
 * Requisitos:
 *   npx supabase login
 *   npx supabase link --project-ref hbfbqqwetaynblmkezeu
 *
 * Uso: npm run gafcore:migrate-workflow
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrations = [
  "20260525120000_gafcore_pipeline_runs.sql",
  "20260528120000_gafcore_agent_tasks.sql",
  "20260529120000_gafcore_task_claim_rpc.sql",
];

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts,
  });
  return r.status ?? 1;
}

console.log("[gafcore] Migraciones workflow:");
for (const m of migrations) {
  const p = join(root, "supabase", "migrations", m);
  if (!existsSync(p)) {
    console.error(`[gafcore] Falta archivo: ${p}`);
    process.exit(1);
  }
  console.log(`  - ${m}`);
}

const query = run("npx", [
  "supabase@latest",
  "db",
  "query",
  "--linked",
  "-f",
  "supabase/scripts/apply-workflow-migrations.sql",
]);
if (query !== 0) {
  console.error(`
[gafcore] Falló. Alternativa manual:
  Supabase Dashboard → SQL Editor → ejecutar:
  supabase/scripts/apply-workflow-migrations.sql
`);
  process.exit(query);
}

console.log("[gafcore] Migraciones workflow aplicadas (verificación ok=1 al final).");
