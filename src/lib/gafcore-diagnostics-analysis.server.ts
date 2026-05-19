import {
  diagnosticAnalysisSchema,
  type DiagnosticAnalysis,
  type DiagnosticReportRow,
} from "@/lib/gafcore-diagnostics.shared";
import {
  completeChatMessage,
  getGafcoreAiGateway,
  resolveGatewayModel,
} from "@/lib/gafcore-ai-gateway.server";

const SYSTEM = `Eres el motor de análisis de operaciones de GafCore (plataforma web/apps con Supabase, Stripe, IA).
Responde SOLO con JSON válido (sin markdown) con esta forma:
{
  "root_cause_analysis": "string",
  "affected_components": ["string"],
  "risk_level": "low|medium|high|critical",
  "suggested_fix": "string detallado",
  "alternative_fixes": ["string"],
  "solution_impacts": [{"solution":"string","impact":"string"}],
  "recommended_fix_type": "run_doctor|health_check_all|sync_stripe_subscription|replay_webhook_guidance" (opcional)
}
NO ejecutes cambios. Solo diagnostica y propone.`;

export async function analyzeDiagnosticReport(
  report: Pick<
    DiagnosticReportRow,
    "module" | "title" | "description" | "possible_root_cause" | "impact" | "severity" | "raw_payload"
  >,
): Promise<DiagnosticAnalysis> {
  const userContent = JSON.stringify(
    {
      module: report.module,
      title: report.title,
      description: report.description,
      possible_root_cause: report.possible_root_cause,
      impact: report.impact,
      severity: report.severity,
      raw_payload: report.raw_payload,
    },
    null,
    2,
  );

  const gateway = getGafcoreAiGateway();
  const model = resolveGatewayModel(gateway, { tier: "fast" });

  const completed = await completeChatMessage({
    model,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Analiza este incidente de GafCore:\n${userContent}` },
    ],
    temperature: 0.2,
    json: true,
  });
  const text = completed.content.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("La IA no devolvió JSON de análisis válido");
  }

  return diagnosticAnalysisSchema.parse(parsed);
}
