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

// Babel standalone: mismo motor que el preview del navegador → paridad real servidor/cliente.
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

const fileSchema = z.object({
  name: z.string().min(1).max(512),
  content: z.string().max(500_000),
});

const schema = z.array(fileSchema).max(40);

/**
 * Validación ligera (transpile TS/JSX via Babel) de archivos generados — sin `tsc` completo ni disco.
 */
export const validateGafcoreSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => schema.parse(input))
  .handler(async ({ data }) => {
    const errors: { name: string; message: string }[] = [];
    const babel = await loadBabel();
    if (!babel) {
      return { ok: true, errors };
    }
    for (const f of data) {
      const isJsx = /\.(tsx|jsx|mtsx)$/i.test(f.name);
      const isTs = /\.(tsx|ts|mts|mtsx)$/i.test(f.name);
      const isScript = /\.(ts|mts|js|mjs|cjs)$/i.test(f.name);
      if (!isJsx && !isScript) continue;
      try {
        const presets: string[] = [];
        if (isTs) presets.push("typescript");
        if (isJsx) presets.push("react");
        babel.transform(f.content, {
          filename: f.name,
          presets,
          configFile: false,
          babelrc: false,
        });
      } catch (e: any) {
        errors.push({ name: f.name, message: String(e?.message || "syntax error").slice(0, 600) });
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
