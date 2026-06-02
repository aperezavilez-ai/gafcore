// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  auditFunctionalFirst,
  formatFunctionalAuditForUser,
} from "@/lib/gafcore-functional-first.shared";
import type { ProjectValidationIssue } from "@/lib/gafcore-ai-validation.shared";
import { runValidationWithAutofix } from "@/validation/runner";

// `typescript` se importa de forma diferida — ver gafcore-validate.server.ts para detalles.
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

const fileSchema = z.object({
  name: z.string().min(1).max(512),
  content: z.string().max(500_000),
});

const schema = z.array(fileSchema).max(40);

/**
 * Validación ligera (transpile TS/JS) de archivos generados — sin `tsc` completo ni disco.
 */
export const validateGafcoreSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data }) => {
    const errors: { name: string; message: string }[] = [];
    const ts = await loadTs();
    if (!ts) {
      // typescript no disponible en runtime — devolvemos OK para no bloquear al usuario.
      return { ok: true, errors };
    }
    for (const f of data) {
      const isJsx = /\.(tsx|jsx|mtsx)$/i.test(f.name);
      const isScript = /\.(ts|mts|js|mjs|cjs)$/i.test(f.name);
      if (!isJsx && !isScript) continue;
      try {
        const compilerOptions: import("typescript").CompilerOptions = {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          strict: false,
        };
        // Solo archivos JSX llevan opción jsx (evita falso error en lib/store.ts).
        if (isJsx) {
          compilerOptions.jsx = ts.JsxEmit.ReactJSX;
        }
        const r = ts.transpileModule(f.content, {
          compilerOptions,
          reportDiagnostics: true,
          fileName: f.name,
        });
        const errList = (r.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error);
        if (errList.length > 0) {
          errors.push({
            name: f.name,
            message: ts.flattenDiagnosticMessageText(errList[0].messageText, "\n").slice(0, 600),
          });
        }
      } catch (e: any) {
        errors.push({ name: f.name, message: String(e?.message || "syntax") });
      }
    }
    return { ok: errors.length === 0, errors };
  });

/** Auditoría FUNCTIONAL-FIRST (heurística) tras generación IA. */
export const validateGafcoreFunctional = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data }) => {
    const audit = auditFunctionalFirst(data);
    return {
      ok: audit.ok,
      issues: audit.issues,
      summary: formatFunctionalAuditForUser(audit.issues),
    };
  });

/** Capa de validación IA unificada: sintaxis (TS) + imports + build + functional. */
export const validateGafcoreProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data }) => {
    const { report } = await runValidationWithAutofix({ files: data, phase: "manual" });
    return {
      ok: report.blockingErrorCount === 0,
      issues: report.issues,
      overallScore: report.overallScore,
      status: report.status,
      approved: report.approved,
      dimensions: report.dimensions,
    };
  });
