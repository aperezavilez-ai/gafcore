import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireGafcoreAdmin } from "@/lib/server-fns/require-gafcore-admin.middleware";
import { runFullDiagnosticScan, type DiagnosticFinding } from "@/lib/gafcore-diagnostics-checks.server";
import { analyzeDiagnosticReport } from "@/lib/gafcore-diagnostics-analysis.server";
import { appendDiagnosticAudit } from "@/lib/gafcore-diagnostics-audit.server";
import {
  executeApprovedFix,
  validateFixInSandbox,
  recordProductionApply,
  type FixExecutionInput,
} from "@/lib/gafcore-diagnostics-fixes.server";
import {
  ADMIN_DECISIONS,
  FIX_TYPES,
  type DiagnosticReportRow,
  type DiagnosticSeverity,
  type FixType,
} from "@/lib/gafcore-diagnostics.shared";

async function insertFinding(
  finding: DiagnosticFinding,
  environment: string,
  actorId?: string,
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("diagnostic_reports")
    .insert({
      module: finding.module,
      title: finding.title,
      description: finding.description,
      possible_root_cause: finding.possible_root_cause ?? null,
      impact: finding.impact ?? null,
      severity: finding.severity,
      status: "pending_analysis",
      source: finding.source,
      raw_payload: finding.raw_payload ?? {},
      environment,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "No se pudo crear reporte");

  await appendDiagnosticAudit({
    reportId: data.id,
    actorId: actorId ?? null,
    eventType: "detected",
    message: `Problema detectado: ${finding.title}`,
    metadata: { source: finding.source, severity: finding.severity },
  });

  return data.id;
}

export const runDiagnosticsScan = createServerFn({ method: "POST" })
  .middleware([requireGafcoreAdmin])
  .inputValidator((d: { origin?: string; environment?: string }) => ({
    origin: d.origin?.trim(),
    environment: d.environment?.trim() || "production",
  }))
  .handler(async ({ data, context }) => {
    const findings = await runFullDiagnosticScan(data.origin);
    const ids: string[] = [];
    for (const f of findings) {
      ids.push(await insertFinding(f, data.environment, context.userId));
    }
    return { created: ids.length, report_ids: ids, ok: findings.length === 0 };
  });

export const ingestDiagnosticReport = createServerFn({ method: "POST" })
  .middleware([requireGafcoreAdmin])
  .inputValidator(
    (d: {
      module: string;
      title: string;
      description: string;
      severity: DiagnosticSeverity;
      source?: string;
      possible_root_cause?: string;
      impact?: string;
      raw_payload?: Record<string, unknown>;
      environment?: string;
    }) => {
      if (!d.module || !d.title || !d.description) throw new Error("Campos requeridos");
      return d;
    },
  )
  .handler(async ({ data, context }) => {
    const id = await insertFinding(
      {
        module: data.module,
        title: data.title,
        description: data.description,
        severity: data.severity,
        source: (data.source as DiagnosticFinding["source"]) || "ingest",
        possible_root_cause: data.possible_root_cause,
        impact: data.impact,
        raw_payload: data.raw_payload,
      },
      data.environment ?? "production",
      context.userId,
    );
    return { id };
  });

export const listDiagnosticReports = createServerFn({ method: "POST" })
  .middleware([requireGafcoreAdmin])
  .inputValidator((d: { limit?: number; status?: string }) => ({
    limit: Math.min(Math.max(d.limit ?? 50, 1), 100),
    status: d.status,
  }))
  .handler(async ({ data }) => {
    let q = supabaseAdmin
      .from("diagnostic_reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { reports: (rows ?? []) as DiagnosticReportRow[] };
  });

export const getDiagnosticReportDetail = createServerFn({ method: "POST" })
  .middleware([requireGafcoreAdmin])
  .inputValidator((d: { id: string }) => {
    if (!d.id) throw new Error("id required");
    return d;
  })
  .handler(async ({ data }) => {
    const { data: report, error } = await supabaseAdmin
      .from("diagnostic_reports")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!report) throw new Error("Reporte no encontrado");

    const { data: audit } = await supabaseAdmin
      .from("diagnostic_audit_log")
      .select("*")
      .eq("report_id", data.id)
      .order("created_at", { ascending: true });

    return {
      report: report as DiagnosticReportRow,
      audit: audit ?? [],
    };
  });

export const analyzeReportWithAi = createServerFn({ method: "POST" })
  .middleware([requireGafcoreAdmin])
  .inputValidator((d: { id: string }) => {
    if (!d.id) throw new Error("id required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { data: report, error } = await supabaseAdmin
      .from("diagnostic_reports")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !report) throw new Error(error?.message ?? "Reporte no encontrado");

    const analysis = await analyzeDiagnosticReport(report as DiagnosticReportRow);
    const proposed = analysis.suggested_fix;
    const fixType = analysis.recommended_fix_type ?? null;

    const { error: upErr } = await supabaseAdmin
      .from("diagnostic_reports")
      .update({
        analysis_json: analysis,
        proposed_fix: proposed,
        fix_type: fixType,
        status: "pending_approval",
      })
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);

    await appendDiagnosticAudit({
      reportId: data.id,
      actorId: context.userId,
      eventType: "ai_analysis",
      message: "Análisis IA completado",
      metadata: { risk_level: analysis.risk_level },
    });

    return { analysis };
  });

const decideSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(ADMIN_DECISIONS),
  modified_fix: z.string().optional(),
});

export const decideDiagnosticReport = createServerFn({ method: "POST" })
  .middleware([requireGafcoreAdmin])
  .inputValidator((input) => decideSchema.parse(input))
  .handler(async ({ data, context }) => {
    const statusMap = {
      approve: "approved",
      reject: "rejected",
      defer: "deferred",
      modify: "pending_approval",
    } as const;

    const patch: Record<string, unknown> = {
      admin_decision: data.decision,
      decided_by: context.userId,
      decided_at: new Date().toISOString(),
      status: statusMap[data.decision],
    };
    if (data.decision === "modify" && data.modified_fix) {
      patch.modified_fix = data.modified_fix;
      patch.status = "pending_approval";
    }

    const { error } = await supabaseAdmin.from("diagnostic_reports").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);

    await appendDiagnosticAudit({
      reportId: data.id,
      actorId: context.userId,
      eventType: `admin_${data.decision}`,
      message: `Decisión admin: ${data.decision}`,
    });

    return { ok: true };
  });

export const executeDiagnosticFix = createServerFn({ method: "POST" })
  .middleware([requireGafcoreAdmin])
  .inputValidator(
    (d: { id: string; fix_type?: FixType; execution_input?: FixExecutionInput }) => {
      if (!d.id) throw new Error("id required");
      return d;
    },
  )
  .handler(async ({ data, context }) => {
    const { data: report, error } = await supabaseAdmin
      .from("diagnostic_reports")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !report) throw new Error(error?.message ?? "Reporte no encontrado");

    const row = report as DiagnosticReportRow;
    if (row.admin_decision !== "approve" && row.admin_decision !== "modify") {
      throw new Error("Solo se ejecuta si el admin aprobó o modificó el plan");
    }

    const fixType = (data.fix_type ?? row.fix_type) as FixType | null;
    if (!fixType || !FIX_TYPES.includes(fixType)) {
      throw new Error("fix_type no definido o no permitido");
    }

    await supabaseAdmin.from("diagnostic_reports").update({ status: "executing" }).eq("id", data.id);

    try {
      const result = await executeApprovedFix({
        reportId: data.id,
        fixType,
        actorId: context.userId,
        input: data.execution_input,
      });

      const sandbox = await validateFixInSandbox(data.id, result);
      await recordProductionApply(data.id, context.userId);

      await supabaseAdmin
        .from("diagnostic_reports")
        .update({
          status: sandbox.sandbox_ok ? "completed" : "failed",
          execution_result: { ...result, sandbox },
        })
        .eq("id", data.id);

      return { ok: true, result, sandbox };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await supabaseAdmin
        .from("diagnostic_reports")
        .update({
          status: "failed",
          execution_result: { error: message },
        })
        .eq("id", data.id);
      throw new Error(message);
    }
  });
