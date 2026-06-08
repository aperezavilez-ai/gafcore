#!/usr/bin/env npx tsx
/**
 * CLI para probar el Input Parser.
 * Uso: npm run gafcore:parse -- "todo app with login"
 */
import { parseUserIdea } from "../src/modules/input-parser/parse-user-idea";

const idea = process.argv.slice(2).join(" ").trim();

if (!idea) {
  console.error("Usage: npm run gafcore:parse -- \"your app idea\"");
  process.exit(1);
}

const parsed = parseUserIdea(idea, { strict: true });
console.log(JSON.stringify(parsed, null, 2));
