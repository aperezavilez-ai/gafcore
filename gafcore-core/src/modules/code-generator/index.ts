/**
 * Módulo 3 — Code Generator (pendiente)
 */
import type { AppBlueprint } from "../../types/blueprint";

export type GeneratedApp = {
  rootDir: string;
  files: Array<{ path: string; content: string }>;
};

export function generateCode(_blueprint: AppBlueprint): GeneratedApp {
  throw new Error("Code Generator not implemented yet.");
}
