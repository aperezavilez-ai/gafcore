#!/usr/bin/env node
/**
 * Smoke local del router multi-proveedor.
 * Verifica que el modelo se enrute a Anthropic, OpenRouter, OpenAI o custom según envs.
 *
 *   npm run gafcore:smoke-routing
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

for (const name of [".env", ".env.local"]) {
  const p = resolve(root, name);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]?.trim()) process.env[k] = v;
  }
}

// Dummies para probar lógica de routing sin exponer keys reales
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY?.trim() || "sk-ant-test-dummy";
process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY?.trim() || "sk-or-v1-test-dummy";

const { resolveAiRoute, normalizeModelSlug, detectModelFamily } = await import(
  "../src/lib/gafcore-model-routing.shared.ts"
);

const cases = [
  { input: "anthropic/claude-sonnet-4.5", expectedFamily: "claude", expectedProvider: "anthropic" },
  { input: "claude-sonnet-4-5", expectedFamily: "claude", expectedProvider: "anthropic" },
  { input: "openai/gpt-4o-mini", expectedFamily: "openai", expectedProvider: "openrouter" },
  { input: "gpt-4o", expectedFamily: "openai", expectedProvider: "openrouter" },
  { input: "google/gemini-2.5-flash", expectedFamily: "gemini", expectedProvider: "openrouter" },
];

let fail = 0;
console.log("\n=== Router GafCore — pruebas ===\n");
for (const c of cases) {
  const fam = detectModelFamily(c.input);
  const route = resolveAiRoute(c.input);
  const okFamily = fam === c.expectedFamily;
  const okProvider = route.provider === c.expectedProvider;
  const ok = okFamily && okProvider;
  if (!ok) fail += 1;
  console.log(
    `${ok ? "OK " : "FAIL"} ${c.input.padEnd(34)} family=${fam.padEnd(7)} → provider=${route.provider.padEnd(11)} slug=${route.modelSlug}`,
  );
}

console.log("\n=== Normalización slugs ===");
console.log("anthropic/claude-sonnet-4.5 → anthropic:", normalizeModelSlug("anthropic/claude-sonnet-4.5", "anthropic"));
console.log("claude-sonnet-4-5           → openrouter:", normalizeModelSlug("claude-sonnet-4-5", "openrouter"));
console.log("gpt-4o-mini                 → openrouter:", normalizeModelSlug("gpt-4o-mini", "openrouter"));
console.log("openai/gpt-4o-mini          → openai:", normalizeModelSlug("openai/gpt-4o-mini", "openai"));

console.log(`\n${fail === 0 ? "[smoke-routing] OK" : `[smoke-routing] FAIL (${fail})`}`);
process.exit(fail === 0 ? 0 : 1);
