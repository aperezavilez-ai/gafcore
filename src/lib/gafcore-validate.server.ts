import {
  auditProjectLocally,
  mergeValidationResults,
  type ProjectValidationIssue,
} from "@/lib/gafcore-ai-validation.shared";

export type ValidateProjectFileInput = {
  name: string;
  content: string;
};

// Cache del módulo `typescript` cargado de forma diferida.
// Razón: `typescript` no está garantizado en runtime serverless (Nitro/Vercel no lo bundlea
// si está como devDep o transitive). Si falta, la validación sintáctica se omite — el resto
// del SSR sigue funcionando.
type TsModule = typeof import("typescript");
let cachedTs: TsModule | null | undefined;

async function loadTs(): Promise<TsModule | null> {
  if (cachedTs !== undefined) return cachedTs;
  try {
    const mod = (await import("typescript")) as unknown as { default?: TsModule } & TsModule;
    cachedTs = (mod.default ?? mod) as TsModule;
  } catch {
    cachedTs = null;
  }
  return cachedTs;
}

/** Núcleo: sintaxis TS + heurísticas locales (sin security/env/score). */
export async function validateGafcoreProjectCore(
  data: ValidateProjectFileInput[],
): Promise<{ ok: boolean; issues: ProjectValidationIssue[] }> {
  const local = auditProjectLocally(data);
  const syntaxErrors: { name: string; message: string }[] = [];

  const ts = await loadTs();
  if (ts) {
    for (const f of data) {
      if (!/\.(mtsx|mts|tsx|ts|jsx|js|cjs|mjs)$/i.test(f.name)) continue;
      try {
        const isTsx = /\.(mtsx|tsx|jsx)$/i.test(f.name);
        const r = ts.transpileModule(f.content, {
          compilerOptions: {
            jsx: isTsx ? ts.JsxEmit.ReactJSX : ts.JsxEmit.None,
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
            strict: false,
          },
          reportDiagnostics: true,
          fileName: f.name,
        });
        const errList = (r.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error);
        if (errList.length > 0) {
          syntaxErrors.push({
            name: f.name,
            message: ts.flattenDiagnosticMessageText(errList[0].messageText, "\n").slice(0, 600),
          });
        }
      } catch (e: unknown) {
        syntaxErrors.push({
          name: f.name,
          message: e instanceof Error ? e.message : "syntax",
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
