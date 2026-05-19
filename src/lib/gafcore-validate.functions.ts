// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import ts from "typescript";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  auditFunctionalFirst,
  formatFunctionalAuditForUser,
} from "@/lib/gafcore-functional-first.shared";
import type { ProjectValidationIssue } from "@/lib/gafcore-ai-validation.shared";
import { runValidationWithAutofix } from "@/validation/runner";

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
    const { report } = runValidationWithAutofix({ files: data, phase: "manual" });
    return {
      ok: report.blockingErrorCount === 0,
      issues: report.issues,
      overallScore: report.overallScore,
      status: report.status,
      approved: report.approved,
      dimensions: report.dimensions,
    };
  });
