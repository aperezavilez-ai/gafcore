import type { ParsedAppIdea } from "../../types/parsed-idea";
import type { AppBlueprint } from "../../types/blueprint";
import { entityToTable } from "../../types/blueprint";
import { buildApiRoutes } from "./api-routes";
import { buildFrontendRoutes } from "./frontend-routes";
import { buildOutputFiles, buildSlug } from "./output-files";
import { blueprintSchema } from "./schema";

const DEFAULT_STACK = {
  frontend: "react-vite" as const,
  backend: "express" as const,
  database: "sqlite" as const,
  orm: "drizzle" as const,
};

export type GenerateBlueprintOptions = {
  strict?: boolean;
};

/**
 * Módulo 2 — Blueprint Generator
 * Convierte el JSON del Input Parser en plan técnico ejecutable.
 */
export function generateBlueprint(
  parsed: ParsedAppIdea,
  options: GenerateBlueprintOptions = {},
): AppBlueprint {
  const blueprint: AppBlueprint = {
    version: 1,
    slug: buildSlug(parsed.title),
    parsed,
    stack: DEFAULT_STACK,
    tables: parsed.entities.map(entityToTable),
    apiRoutes: buildApiRoutes(parsed),
    frontendRoutes: buildFrontendRoutes(parsed),
    outputFiles: buildOutputFiles(parsed),
  };

  if (options.strict) {
    return blueprintSchema.parse(blueprint);
  }

  return blueprint;
}
