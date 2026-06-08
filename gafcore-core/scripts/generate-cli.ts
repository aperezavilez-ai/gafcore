#!/usr/bin/env npx tsx
/**
 * Pipeline módulos 1 → 2 → 3: idea → archivos en disco
 * Uso: npm run gafcore:generate -- "todo app with login"
 */
import { join } from "node:path";
import { parseUserIdea } from "../src/modules/input-parser/parse-user-idea";
import { generateBlueprint } from "../src/modules/blueprint-generator/generate-blueprint";
import { generateCode } from "../src/modules/code-generator/generate-code";
import { writeGeneratedApp } from "../src/modules/code-generator/write-app";

const idea = process.argv.slice(2).join(" ").trim();
const cwd = process.cwd();

if (!idea) {
  console.error("Usage: npm run gafcore:generate -- \"your app idea\"");
  process.exit(1);
}

const parsed = parseUserIdea(idea, { strict: true });
const blueprint = generateBlueprint(parsed, { strict: true });
const app = generateCode(blueprint);
const root = await writeGeneratedApp(app, cwd);

console.log(
  JSON.stringify(
    {
      ok: true,
      slug: app.slug,
      root,
      fileCount: app.files.length,
      next: [`cd ${app.rootDir}`, "npm install", "npm run db:push", "npm run dev"],
    },
    null,
    2,
  ),
);
