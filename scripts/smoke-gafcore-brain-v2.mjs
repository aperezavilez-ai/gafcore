#!/usr/bin/env node
/**
 * Smoke: Brain V2 ensambla system prompt con recency bias y directiva Gemini.
 *   npm run gafcore:smoke-brain-v2
 */
import assert from "node:assert/strict";
import {
  GAFCORE_SYSTEM_PROMPT_V2,
  buildGafcoreBrainV2SystemContent,
  buildGeminiBrainV2Directive,
  isGeminiBrainModel,
} from "../src/lib/gafcore-brain-v2.ts";

assert.ok(GAFCORE_SYSTEM_PROMPT_V2.includes("STRICT ARCHITECTURE PROTOCOL"));
assert.equal(isGeminiBrainModel("google/gemini-2.0-flash-001"), true);
assert.equal(isGeminiBrainModel("openai/gpt-4o"), false);

const geminiDirective = buildGeminiBrainV2Directive("gemini-1.5-flash");
assert.ok(geminiDirective.includes("BRAIN V2"));

const system = buildGafcoreBrainV2SystemContent({
  legacyAppend: "[legacy test]",
  model: "gemini-1.5-pro",
});
const first = system.indexOf("[STRICT ARCHITECTURE PROTOCOL");
const last = system.lastIndexOf("[STRICT ARCHITECTURE PROTOCOL");
assert.ok(first >= 0 && last > first, "V2 debe aparecer al inicio y al final (recency)");
assert.ok(system.includes("[GEMINI + BRAIN V2]"));
assert.ok(system.includes("[legacy test]"));

console.log("smoke-gafcore-brain-v2: OK");
