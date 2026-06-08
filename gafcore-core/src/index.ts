/**
 * GafCore Minimal Core v2 — API pública
 */

export type {
  AppType,
  AuthMethod,
  ParsedAppIdea,
  ParsedEntity,
  ParsedFeature,
  ParsedPage,
} from "./types/parsed-idea";

export type {
  AppBlueprint,
  BlueprintApiRoute,
  BlueprintColumn,
  BlueprintFrontendRoute,
  BlueprintStack,
  BlueprintTable,
} from "./types/blueprint";

export { parseUserIdea, parsedAppIdeaSchema } from "./modules/input-parser";
export {
  generateBlueprint,
  blueprintSchema,
  type GenerateBlueprintOptions,
} from "./modules/blueprint-generator";
export {
  generateCode,
  writeGeneratedApp,
  type GeneratedApp,
  type GeneratedFile,
  type GenerateCodeOptions,
} from "./modules/code-generator";
export {
  runGeneratedApp,
  type RunGeneratedAppOptions,
  type RunResult,
  type RunStep,
} from "./modules/runner";

import { parseUserIdea } from "./modules/input-parser";
import { generateBlueprint } from "./modules/blueprint-generator";
import { generateCode } from "./modules/code-generator";
import { writeGeneratedApp } from "./modules/code-generator/write-app";
import { runGeneratedApp } from "./modules/runner/run-generated-app";
import type { RunGeneratedAppOptions, RunResult } from "./modules/runner/types";
import type { ParsedAppIdea } from "./types/parsed-idea";
import type { AppBlueprint } from "./types/blueprint";
import type { GeneratedApp } from "./modules/code-generator/types";

/** Pipeline módulos 1 → 2 */
export function parseAndBlueprint(idea: string): { parsed: ParsedAppIdea; blueprint: AppBlueprint } {
  const parsed = parseUserIdea(idea, { strict: true });
  const blueprint = generateBlueprint(parsed, { strict: true });
  return { parsed, blueprint };
}

/** Pipeline módulos 1 → 2 → 3 */
export function parseBlueprintAndCode(idea: string): {
  parsed: ParsedAppIdea;
  blueprint: AppBlueprint;
  app: GeneratedApp;
} {
  const { parsed, blueprint } = parseAndBlueprint(idea);
  const app = generateCode(blueprint);
  return { parsed, blueprint, app };
}

/** Pipeline completo 1 → 2 → 3 → 4 */
export async function generateAndRun(
  idea: string,
  options: RunGeneratedAppOptions & { baseDir?: string } = {},
): Promise<{
  parsed: ParsedAppIdea;
  blueprint: AppBlueprint;
  app: GeneratedApp;
  run: RunResult;
}> {
  const { parsed, blueprint, app } = parseBlueprintAndCode(idea);
  const baseDir = options.baseDir ?? process.cwd();
  await writeGeneratedApp(app, baseDir);
  const run = await runGeneratedApp(app, { ...options, baseDir });
  return { parsed, blueprint, app, run };
}
