/**
 * Módulo 4 — Runner (pendiente)
 */
import type { GeneratedApp } from "../code-generator";

export type RunResult = {
  ok: boolean;
  url?: string;
  error?: string;
};

export async function runGeneratedApp(_app: GeneratedApp): Promise<RunResult> {
  throw new Error("Runner not implemented yet.");
}
