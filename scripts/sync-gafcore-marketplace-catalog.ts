#!/usr/bin/env node
/**
 * Publica plantillas + plugins oficiales en Supabase (marketplace GafCore Labs).
 * Usa SUPABASE_SERVICE_ROLE_KEY desde .env.local — no requiere sesión admin.
 *
 *   npm run gafcore:sync-marketplace-catalog
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { syncBuiltinCatalogToMarketplace } from "@/extensions/marketplace-builtin-sync.server";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFiles() {
  for (const name of [".env", ".env.development", ".env.local"]) {
    const p = resolve(root, name);
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
      if (!process.env[k]?.trim()) process.env[k] = v;
    }
  }
  if (!process.env.SUPABASE_URL?.trim() && process.env.VITE_SUPABASE_URL?.trim()) {
    process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL.trim();
  }
  if (
    !process.env.SUPABASE_PUBLISHABLE_KEY?.trim() &&
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  ) {
    process.env.SUPABASE_PUBLISHABLE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY.trim();
  }
}

async function main() {
  loadEnvFiles();

  if (!process.env.SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    console.error("[gafcore] Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
    process.exit(1);
  }

  process.env.GAFCORE_EXTENSIONS_ENABLED = process.env.GAFCORE_EXTENSIONS_ENABLED ?? "1";

  console.log("[gafcore] Sincronizando catálogo marketplace (plantillas + plugins)…\n");

  const result = await syncBuiltinCatalogToMarketplace();

  if (!result.ok) {
    console.error("[gafcore] Error:", result.error);
    process.exit(1);
  }

  console.log("Plantillas:", result.templates.synced, "→", result.templates.slugs.join(", "));
  if (result.templates.errors.length) {
    console.warn("Avisos plantillas:", result.templates.errors.join("; "));
  }
  console.log("Plugins:", result.plugins.synced, "→", result.plugins.slugs.join(", "));
  if (result.plugins.errors.length) {
    console.warn("Avisos plugins:", result.plugins.errors.join("; "));
  }
  console.log("\n[gafcore] Catálogo sincronizado. Verifica: /gafcore/marketplace\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
