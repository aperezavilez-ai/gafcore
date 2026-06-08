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

export type { AppBlueprint, BlueprintStack } from "./types/blueprint";

export { parseUserIdea, parsedAppIdeaSchema } from "./modules/input-parser";
export { generateBlueprint } from "./modules/blueprint-generator";
export { generateCode, type GeneratedApp } from "./modules/code-generator";
export { runGeneratedApp, type RunResult } from "./modules/runner";
