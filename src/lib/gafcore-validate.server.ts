import {
  auditProjectLocally,
  mergeValidationResults,
  type ProjectValidationIssue,
} from "@/lib/gafcore-ai-validation.shared";

export type ValidateProjectFileInput = {
  name: string;
  content: string;
};

// Babel standalone: mismo motor que usa el preview del navegador → paridad real
// servidor/cliente. Se bundlea en el lambda (no está en la lista external de vite.config).
type BabelStandalone = {
  transform: (code: string, opts: Record<string, unknown>) => { code: string | null };
};
let cachedBabel: BabelStandalone | null | undefined;

async function loadBabel(): Promise<BabelStandalone | null> {
  if (cachedBabel !== undefined) return cachedBabel;
  try {
    const mod = (await import("@babel/standalone")) as unknown as
      | { default?: BabelStandalone }
      | BabelStandalone;
    cachedBabel = (("default" in mod ? (mod as { default?: BabelStandalone }).default : undefined) ??
      (mod as BabelStandalone));
  } catch {
    cachedBabel = null;
  }
  return cachedBabel;
}

/** Núcleo: sintaxis TS/JSX via Babel + heurísticas locales (sin security/env/score). */
export async function validateGafcoreProjectCore(
  data: ValidateProjectFileInput[],
): Promise<{ ok: boolean; issues: ProjectValidationIssue[] }> {
  const local = auditProjectLocally(data);
  const syntaxErrors: { name: string; message: string }[] = [];

  const babel = await loadBabel();
  if (babel) {
    for (const f of data) {
      if (!/\.(mtsx|mts|tsx|ts|jsx|js|cjs|mjs)$/i.test(f.name)) continue;
      try {
        const isTs = /\.(mtsx|mts|tsx|ts)$/i.test(f.name);
        const isJsx = /\.(mtsx|tsx|jsx)$/i.test(f.name);
        const presets: string[] = [];
        if (isTs) presets.push("typescript");
        if (isJsx) presets.push("react");
        babel.transform(f.content, {
          filename: f.name,
          presets,
          configFile: false,
          babelrc: false,
        });
      } catch (e: unknown) {
        syntaxErrors.push({
          name: f.name,
          message: (e instanceof Error ? e.message : "syntax error").slice(0, 600),
        });
      }
    }
  }

  const syntaxIssues: ProjectValidationIssue[] = syntaxErrors.map((e) => ({
    severity: "error",
    category: "syntax",
    file: e.name,
    message: e.message,
  }));

  const merged = mergeValidationResults(local, { ok: syntaxIssues.length === 0, issues: syntaxIssues });
  return { ok: merged.ok, issues: merged.issues };
}
