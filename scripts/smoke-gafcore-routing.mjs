#!/usr/bin/env node
/**
 * Smoke local del router multi-proveedor.
 * Verifica que el modelo se enrute a Anthropic, OpenRouter, OpenAI, custom
 * o GPTPRO4ALL segun envs.
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

// Dummies para probar logica de routing sin exponer keys reales.
process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY?.trim() || "sk-ant-test-dummy";
process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY?.trim() || "sk-or-v1-test-dummy";

const { normalizeModelSlug, detectModelFamily } = await import(
  "../src/lib/gafcore-model-routing.shared.ts"
);
const { resolveAiRoute } = await import("../src/lib/gafcore-model-routing.server.ts");
const { resolveGafcoreModelDefaults } = await import("../src/lib/gafcore-chat.shared.ts");

const cases = [
  { input: "anthropic/claude-sonnet-4.5", expectedFamily: "claude", expectedProvider: "anthropic" },
  { input: "claude-sonnet-4-5", expectedFamily: "claude", expectedProvider: "anthropic" },
  { input: "openai/gpt-4o-mini", expectedFamily: "openai", expectedProvider: "openrouter" },
  { input: "gpt-4o", expectedFamily: "openai", expectedProvider: "openrouter" },
  { input: "google/gemini-2.5-flash", expectedFamily: "gemini", expectedProvider: "openrouter" },
];

let fail = 0;
console.log("\n=== Router GafCore - pruebas ===\n");
for (const c of cases) {
  const fam = detectModelFamily(c.input);
  const route = resolveAiRoute(c.input);
  const okFamily = fam === c.expectedFamily;
  const okProvider = route.provider === c.expectedProvider;
  const ok = okFamily && okProvider;
  if (!ok) fail += 1;
  console.log(
    `${ok ? "OK " : "FAIL"} ${c.input.padEnd(34)} family=${fam.padEnd(7)} -> provider=${route.provider.padEnd(11)} slug=${route.modelSlug}`,
  );
}

console.log("\n=== Normalizacion slugs ===");
console.log("anthropic/claude-sonnet-4.5 -> anthropic:", normalizeModelSlug("anthropic/claude-sonnet-4.5", "anthropic"));
console.log("claude-sonnet-4-5           -> openrouter:", normalizeModelSlug("claude-sonnet-4-5", "openrouter"));
console.log("gpt-4o-mini                 -> openrouter:", normalizeModelSlug("gpt-4o-mini", "openrouter"));
console.log("openai/gpt-4o-mini          -> openai:", normalizeModelSlug("openai/gpt-4o-mini", "openai"));

const previousEnv = {
  AI_CHAT_COMPLETIONS_URL: process.env.AI_CHAT_COMPLETIONS_URL,
  GPTPRO4ALL_BASE_URL: process.env.GPTPRO4ALL_BASE_URL,
  GPTPRO4ALL_API_KEY: process.env.GPTPRO4ALL_API_KEY,
  AI_API_KEY: process.env.AI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  AI_MODEL_FAST: process.env.AI_MODEL_FAST,
  AI_MODEL_DEEP: process.env.AI_MODEL_DEEP,
  AI_MODEL_UI: process.env.AI_MODEL_UI,
};

for (const key of Object.keys(previousEnv)) delete process.env[key];
process.env.AI_CHAT_COMPLETIONS_URL = "https://api.chatgptpro4all.com/v1";
process.env.AI_API_KEY = "sk-test-gptpro4all";
process.env.ANTHROPIC_API_KEY = "sk-ant-test-dummy";

const customRoute = resolveAiRoute("gpt-5.5");
const defaultRoute = resolveAiRoute();
const customDefaults = resolveGafcoreModelDefaults(customRoute.url);
const okCustom =
  customRoute.provider === "gptpro4all" &&
  defaultRoute.provider === "gptpro4all" &&
  customRoute.wireApi === "responses" &&
  customRoute.url === "https://api.chatgptpro4all.com/v1/responses" &&
  customDefaults.fast === "gpt-5.5" &&
  customDefaults.deep === "gpt-5.5" &&
  customDefaults.ui === "gpt-5.5";
if (!okCustom) fail += 1;
console.log(
  `\n${okCustom ? "OK " : "FAIL"} chatgptpro4all responses -> provider=${customRoute.provider} url=${customRoute.url} model=${customDefaults.deep}`,
);
console.log(
  `${defaultRoute.provider === "gptpro4all" ? "OK " : "FAIL"} default with Claude configured -> provider=${defaultRoute.provider}`,
);

const claudeRoute = resolveAiRoute("claude-sonnet-4-5");
const okClaudePriority =
  claudeRoute.provider === "anthropic" &&
  claudeRoute.modelSlug === "claude-sonnet-4-5";
if (!okClaudePriority) fail += 1;
console.log(
  `${okClaudePriority ? "OK " : "FAIL"} claude with GPTPRO4ALL configured -> provider=${claudeRoute.provider} slug=${claudeRoute.modelSlug}`,
);

for (const [key, value] of Object.entries(previousEnv)) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

console.log(`\n${fail === 0 ? "[smoke-routing] OK" : `[smoke-routing] FAIL (${fail})`}`);
process.exit(fail === 0 ? 0 : 1);
