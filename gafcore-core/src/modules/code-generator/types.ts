import type { AppBlueprint } from "../../types/blueprint";

export type GeneratedFile = {
  path: string;
  content: string;
};

export type GeneratedApp = {
  slug: string;
  rootDir: string;
  files: GeneratedFile[];
};

export type GenerateCodeOptions = {
  /** Directorio raíz sugerido (relativo). Default: generated-apps/{slug} */
  rootDir?: string;
};

export type EmitContext = {
  blueprint: AppBlueprint;
};
