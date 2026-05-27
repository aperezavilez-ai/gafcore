/**
 * Smoke de compilación sintáctica (transpile TS/JS) para Modo Fábrica.
 */
import { validateGafcoreProjectCore } from "@/lib/gafcore-validate.server";
import type { FactoryFileOut } from "@/lib/gafcore-factory.shared";

export type FactoryBuildSmokeResult = {
  ok: boolean;
  hasEntry: boolean;
  entryFiles: string[];
  syntaxErrorCount: number;
  blockingCount: number;
  message: string;
};

const ENTRY_PATTERNS = [
  /^App\.tsx$/i,
  /^App\.jsx$/i,
  /^src\/App\.tsx$/i,
  /^src\/App\.jsx$/i,
  /^main\.tsx$/i,
  /^src\/main\.tsx$/i,
];

export function projectHasEntryPoint(files: FactoryFileOut[]): {
  hasEntry: boolean;
  entryFiles: string[];
} {
  const names = files.map((f) => f.name.replace(/\\/g, "/"));
  const entryFiles = names.filter((n) => ENTRY_PATTERNS.some((re) => re.test(n)));
  return {
    hasEntry: entryFiles.length > 0,
    entryFiles,
  };
}

/** Transpile + heurísticas locales; no sustituye validación completa pre_deploy. */
export async function runFactoryBuildSmoke(
  files: FactoryFileOut[],
): Promise<FactoryBuildSmokeResult> {
  const { hasEntry, entryFiles } = projectHasEntryPoint(files);
  const payload = files.map((f) => ({ name: f.name, content: f.content }));
  const core = await validateGafcoreProjectCore(payload);

  const syntaxErrorCount = core.issues.filter(
    (i) => i.severity === "error" && i.category === "syntax",
  ).length;
  const blockingCount = core.issues.filter((i) => i.severity === "error").length;

  if (!hasEntry) {
    return {
      ok: false,
      hasEntry: false,
      entryFiles: [],
      syntaxErrorCount,
      blockingCount,
      message: "Falta App.tsx o punto de entrada (main.tsx).",
    };
  }

  if (blockingCount > 0) {
    return {
      ok: false,
      hasEntry: true,
      entryFiles,
      syntaxErrorCount,
      blockingCount,
      message: `Build smoke: ${blockingCount} error(es) de sintaxis o estructura.`,
    };
  }

  return {
    ok: true,
    hasEntry: true,
    entryFiles,
    syntaxErrorCount: 0,
    blockingCount: 0,
    message: "Build smoke OK (transpile sin errores).",
  };
}
