#!/usr/bin/env npx tsx
/**
 * Pipeline completo 1→2→3→4: idea → generar → ejecutar → verificar health
 *
 * Uso:
 *   npm run gafcore:run -- "todo app with login"
 *   npm run gafcore:run -- "todo app with login" --keep
 */
import { parseUserIdea } from "../src/modules/input-parser/parse-user-idea";
import { generateBlueprint } from "../src/modules/blueprint-generator/generate-blueprint";
import { generateCode } from "../src/modules/code-generator/generate-code";
import { writeGeneratedApp } from "../src/modules/code-generator/write-app";
import { runGeneratedApp } from "../src/modules/runner/run-generated-app";

const args = process.argv.slice(2);
const keepDev = args.includes("--keep");
const idea = args.filter((a) => a !== "--keep").join(" ").trim();

if (!idea) {
  console.error("Usage: npm run gafcore:run -- \"your app idea\" [--keep]");
  process.exit(1);
}

const parsed = parseUserIdea(idea, { strict: true });
const blueprint = generateBlueprint(parsed, { strict: true });
const app = generateCode(blueprint);
const root = await writeGeneratedApp(app, process.cwd());

const result = await runGeneratedApp(app, {
  baseDir: process.cwd(),
  keepDevRunning: keepDev,
});

console.log(
  JSON.stringify(
    {
      ...result,
      message: result.ok
        ? keepDev
          ? `App corriendo. API ${result.apiUrl} · UI ${result.clientUrl}`
          : `Smoke OK. Para desarrollo: cd ${app.rootDir} && npm run dev`
        : `Falló: ${result.error}`,
    },
    null,
    2,
  ),
);

process.exit(result.ok ? 0 : 1);
