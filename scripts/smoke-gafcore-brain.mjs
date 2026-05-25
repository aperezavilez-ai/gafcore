#!/usr/bin/env node
/**
 * Smoke real del cerebro híbrido en producción.
 * Pide a Claude Sonnet 4.5 que genere una landing y compara salida vs GPT-4o-mini.
 *
 *   npm run gafcore:smoke-brain
 *   GAFCORE_SMOKE_BASE=http://127.0.0.1:5174 npm run gafcore:smoke-brain
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

const PROMPT =
  "Diseña una landing page profesional para una marca SaaS B2B de gestión de inventario llamada 'StockFlow'. Hero centrado, 3 features con icono, sección de pricing con 3 planes, testimonios, CTA final y footer. Usa Tailwind v4 con tokens semánticos, mobile-first y un par tipográfico Inter+Space Grotesk. Color base violeta. Devuelve App.tsx, main.tsx, index.html y styles.css.";

async function callBrain(model) {
  const route = await import("../src/lib/gafcore-model-routing.shared.ts").then((m) =>
    m.resolveAiRoute(model),
  );
  console.log(`\n[${model}] → provider=${route.provider} slug=${route.modelSlug}`);

  const { postChatCompletions } = await import("../src/lib/ai-chat-completions.server.ts");
  const t0 = Date.now();

  const res = await postChatCompletions({
    model,
    messages: [
      {
        role: "system",
        content:
          "Eres un diseñador senior. Devuelve solo JSON: { reply: string, files: [{ name, language, content }] }",
      },
      { role: "user", content: PROMPT },
    ],
    temperature: 0.7,
    max_tokens: 8000,
  });

  const ms = Date.now() - t0;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`  FAIL HTTP ${res.status} in ${ms}ms:`, text.slice(0, 200));
    return { ok: false, ms };
  }
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content ?? "";
  console.log(`  OK ${ms}ms, ${content.length} chars`);

  let files = 0;
  try {
    const obj = JSON.parse(content);
    files = obj?.files?.length ?? 0;
  } catch {
    /* contenido no JSON puro */
  }
  console.log(`  files=${files}`);
  return { ok: true, ms, chars: content.length, files };
}

async function main() {
  console.log("=== Smoke cerebro GafCore (Fase 1) ===");
  const claude = await callBrain("anthropic/claude-sonnet-4.5");
  const gpt = await callBrain("openai/gpt-4o-mini");

  console.log("\n=== Comparativa ===");
  console.log(`Claude Sonnet 4.5: ${claude.ok ? "OK" : "FAIL"} ${claude.ms}ms ${claude.chars ?? 0}c files=${claude.files ?? 0}`);
  console.log(`GPT-4o-mini      : ${gpt.ok ? "OK" : "FAIL"} ${gpt.ms}ms ${gpt.chars ?? 0}c files=${gpt.files ?? 0}`);
}

main().catch((e) => {
  console.error("[smoke-brain]", e);
  process.exit(1);
});
