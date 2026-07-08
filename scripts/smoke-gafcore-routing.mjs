#!/usr/bin/env node
/**
 * Smoke local del router IA GafCore.
 * Permitidos:
 * 1) api.meai.cloud
 * 2) api.chatgptpro4all.com
 * 3) openrouter.ai
 * 4) Gemini directo en Google APIs
 */

const envKeys = [
  "AI_CHAT_COMPLETIONS_URL",
  "AI_API_KEY",
  "AI_MODEL_FAST",
  "AI_MODEL_DEEP",
  "AI_MODEL_UI",
  "MEAI_API_KEY",
  "MEAI_BASE_URL",
  "MEAI_CHAT_COMPLETIONS_URL",
  "GAFCORE_MEAI_API_KEY",
  "GAFCORE_MEAI_BASE_URL",
  "GAFCORE_MEAI_CHAT_COMPLETIONS_URL",
  "GPTPRO4ALL_BASE_URL",
  "GPTPRO4ALL_API_KEY",
  "OPENROUTER_API_KEY",
  "OPENROUTER_CHAT_COMPLETIONS_URL",
  "GEMINI_API_KEY",
  "GOOGLE_AI_API_KEY",
  "GOOGLE_API_KEY",
  "GEMINI_MODEL",
  "GOOGLE_AI_MODEL",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "OPENAI_CHAT_COMPLETIONS_URL",
];

const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

function clearEnv() {
  for (const key of envKeys) delete process.env[key];
}

function restoreEnv() {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`OK   ${label}${detail ? ` ${detail}` : ""}`);
    return 0;
  }
  console.log(`FAIL ${label}${detail ? ` ${detail}` : ""}`);
  return 1;
}

const { resolveAiRoute, resolveAllAiRoutes } = await import("../src/lib/gafcore-model-routing.server.ts");

let fail = 0;
console.log("\n=== Router GafCore allowlist ===\n");

clearEnv();
process.env.OPENAI_API_KEY = "sk-openai-test";
process.env.ANTHROPIC_API_KEY = "sk-ant-test";
fail += check(
  "ignora OpenAI/Anthropic directos",
  resolveAllAiRoutes("openai/gpt-4o").length === 0,
);

let threwAllowedConfig = false;
try {
  resolveAiRoute("openai/gpt-4o");
} catch (err) {
  threwAllowedConfig = /api\.meai\.cloud|api\.chatgptpro4all\.com|openrouter\.ai|Gemini/i.test(
    String(err instanceof Error ? err.message : err),
  );
}
fail += check("sin API permitida falla claro", threwAllowedConfig);

clearEnv();
process.env.MEAI_API_KEY = "meai-test";
process.env.GPTPRO4ALL_API_KEY = "gptpro-test";
process.env.OPENROUTER_API_KEY = "or-test";
process.env.GEMINI_API_KEY = "gemini-test";
const priorityRoutes = resolveAllAiRoutes("google/gemini-2.5-pro");
fail += check("MeAI es primario", priorityRoutes[0]?.url === "https://api.meai.cloud/v1/chat/completions", `url=${priorityRoutes[0]?.url}`);
fail += check("ChatGPTPro4All es secundario", priorityRoutes[1]?.url === "https://api.chatgptpro4all.com/v1/responses", `url=${priorityRoutes[1]?.url}`);
fail += check("OpenRouter es tercero", priorityRoutes[2]?.provider === "openrouter", `provider=${priorityRoutes[2]?.provider}`);
fail += check("Gemini directo es cuarto", priorityRoutes[3]?.provider === "gemini", `provider=${priorityRoutes[3]?.provider}`);

clearEnv();
process.env.AI_CHAT_COMPLETIONS_URL = "https://api.meai.cloud/v1";
process.env.AI_API_KEY = "meai-ai-key";
const meaiRoute = resolveAiRoute("gpt-5.5");
fail += check("AI_CHAT_COMPLETIONS_URL acepta MeAI", meaiRoute.url === "https://api.meai.cloud/v1/chat/completions", `url=${meaiRoute.url}`);

clearEnv();
process.env.AI_CHAT_COMPLETIONS_URL = "https://api.chatgptpro4all.com/v1";
process.env.AI_API_KEY = "gptpro-ai-key";
const gptproRoute = resolveAiRoute("gpt-5.5");
fail += check("AI_CHAT_COMPLETIONS_URL acepta ChatGPTPro4All", gptproRoute.url === "https://api.chatgptpro4all.com/v1/responses", `url=${gptproRoute.url}`);
fail += check("ChatGPTPro4All usa Responses API", gptproRoute.wireApi === "responses", `wire=${gptproRoute.wireApi}`);

clearEnv();
process.env.OPENROUTER_API_KEY = "or-test";
const openRouterRoute = resolveAiRoute("claude-sonnet-4-5");
fail += check("OpenRouter permitido", openRouterRoute.url === "https://openrouter.ai/api/v1/chat/completions", `url=${openRouterRoute.url}`);
fail += check("OpenRouter normaliza modelos Claude", openRouterRoute.modelSlug.startsWith("anthropic/"), `model=${openRouterRoute.modelSlug}`);

clearEnv();
process.env.GOOGLE_AI_API_KEY = "google-test";
const geminiRoute = resolveAiRoute("google/gemini-2.5-flash");
fail += check("Gemini directo permitido", geminiRoute.provider === "gemini", `provider=${geminiRoute.provider}`);
fail += check("Gemini usa wire API propia", geminiRoute.wireApi === "gemini_generate_content", `wire=${geminiRoute.wireApi}`);
fail += check("Gemini quita prefijo google/", geminiRoute.modelSlug === "gemini-2.5-flash", `model=${geminiRoute.modelSlug}`);

clearEnv();
process.env.AI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
process.env.AI_API_KEY = "sk-openai-test";
fail += check(
  "AI_CHAT_COMPLETIONS_URL bloquea OpenAI directo",
  resolveAllAiRoutes("gpt-4o").length === 0,
);

restoreEnv();

console.log(`\n${fail === 0 ? "[smoke-routing] OK" : `[smoke-routing] FAIL (${fail})`}`);
process.exit(fail === 0 ? 0 : 1);
