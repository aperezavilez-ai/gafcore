#!/usr/bin/env npx tsx
/**
 * Pipeline módulos 1 + 2: idea → parsed JSON → blueprint
 * Uso: npm run gafcore:blueprint -- "todo app with login"
 */
import { parseUserIdea } from "../src/modules/input-parser/parse-user-idea";
import { generateBlueprint } from "../src/modules/blueprint-generator/generate-blueprint";

const idea = process.argv.slice(2).join(" ").trim();

if (!idea) {
  console.error("Usage: npm run gafcore:blueprint -- \"your app idea\"");
  process.exit(1);
}

const parsed = parseUserIdea(idea, { strict: true });
const blueprint = generateBlueprint(parsed, { strict: true });

console.log(
  JSON.stringify(
    {
      parsed: { title: parsed.title, appType: parsed.appType, auth: parsed.auth },
      blueprint: {
        slug: blueprint.slug,
        stack: blueprint.stack,
        tables: blueprint.tables.map((t) => t.name),
        apiRoutes: blueprint.apiRoutes.map((r) => `${r.method} ${r.path}`),
        frontendRoutes: blueprint.frontendRoutes.map((r) => r.path),
        outputFileCount: blueprint.outputFiles.length,
        outputFiles: blueprint.outputFiles,
      },
    },
    null,
    2,
  ),
);
