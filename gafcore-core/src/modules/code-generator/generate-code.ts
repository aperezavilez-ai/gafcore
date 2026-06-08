import type { AppBlueprint } from "../../types/blueprint";
import { emitConfig } from "./emit/config";
import { emitSchema } from "./emit/schema";
import { emitServerCore } from "./emit/server-core";
import { emitRoutes } from "./emit/routes";
import { emitClient } from "./emit/client";
import type { GenerateCodeOptions, GeneratedApp, GeneratedFile } from "./types";

function collectFiles(blueprint: AppBlueprint): GeneratedFile[] {
  const ctx = { blueprint };
  return [
    ...emitConfig(ctx),
    ...emitSchema(ctx),
    ...emitServerCore(ctx),
    ...emitRoutes(ctx),
    ...emitClient(ctx),
  ];
}

/**
 * Módulo 3 — Code Generator
 * Genera archivos reales (Express + SQLite + React) desde el blueprint.
 */
export function generateCode(
  blueprint: AppBlueprint,
  options: GenerateCodeOptions = {},
): GeneratedApp {
  const all = collectFiles(blueprint);
  const allowed = new Set(blueprint.outputFiles);
  const files = all.filter((f) => allowed.has(f.path));

  const missing = blueprint.outputFiles.filter((p) => !files.some((f) => f.path === p));
  if (missing.length > 0) {
    throw new Error(`Code Generator missing emitters for: ${missing.join(", ")}`);
  }

  const rootDir = options.rootDir ?? `generated-apps/${blueprint.slug}`;

  return {
    slug: blueprint.slug,
    rootDir,
    files,
  };
}
