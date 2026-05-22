#!/usr/bin/env node
/**
 * Imprime IDs de Vercel para configurar GitHub Actions (sin secretos).
 * Uso: npm run gafcore:github-actions-setup
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const projectJson = join(root, ".vercel", "project.json");

console.log(`
GitHub Actions — Deploy Vercel Production
=========================================
Repo → Settings → Secrets and variables → Actions

| Secret | Valor |
|--------|--------|
| VERCEL_TOKEN | https://vercel.com/account/tokens |
| VERCEL_ORG_ID | ver abajo |
| VERCEL_PROJECT_ID | ver abajo |

`);

if (existsSync(projectJson)) {
  const raw = JSON.parse(readFileSync(projectJson, "utf8"));
  console.log("Desde .vercel/project.json (npm run gafcore:link o vercel link):\n");
  console.log(`  VERCEL_ORG_ID=${raw.orgId ?? "(falta orgId)"}`);
  console.log(`  VERCEL_PROJECT_ID=${raw.projectId ?? "(falta projectId)"}\n`);
} else {
  console.log("No hay .vercel/project.json. Ejecuta:\n");
  console.log("  npx vercel link --project gafcore\n");
  console.log("  npm run gafcore:github-actions-setup\n");
}

console.log("Docs: docs/DEPLOY_GITHUB_ACTIONS.md\n");
