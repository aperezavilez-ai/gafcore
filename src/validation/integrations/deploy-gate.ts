import type { SupabaseClient } from "@supabase/supabase-js";
import { persistValidationRun } from "@/lib/gafcore-validation.server";
import { applyDeterministicAutofix } from "@/validation/autofix/registry";
import { runValidationLayer } from "@/validation/runner";
import type { ValidationFileInput } from "@/validation/types";

export type DeployGateMode = "hard" | "soft" | "off";

export function getDeployValidationGateMode(): DeployGateMode {
  const raw = (process.env.GAFCORE_DEPLOY_VALIDATION_GATE ?? "hard").trim().toLowerCase();
  if (raw === "off" || raw === "0" || raw === "false") return "off";
  if (raw === "soft" || raw === "warn") return "soft";
  return "hard";
}

export type DeployGateResult =
  | { allowed: true; warning?: string; overallScore: number; status: string }
  | { allowed: false; message: string; overallScore: number; status: string };

/**
 * Valida el proyecto antes de publicar (fase pre_deploy).
 * hard: bloquea si no approved; soft: avisa; off: solo log.
 */
export async function runDeployValidationGate(
  sb: SupabaseClient,
  input: {
    projectId: string;
    userId: string;
    files: ValidationFileInput[];
  },
): Promise<DeployGateResult> {
  const mode = getDeployValidationGateMode();
  if (mode === "off") {
    return { allowed: true, overallScore: 100, status: "approved" };
  }

  const { files: fixed, applied } = applyDeterministicAutofix(
    input.files.slice(0, 40).map((f) => ({ name: f.name, content: f.content })),
  );

  const report = await runValidationLayer({
    files: fixed,
    phase: "pre_deploy",
    projectId: input.projectId,
    userId: input.userId,
  });

  try {
    await persistValidationRun(sb, {
      projectId: input.projectId,
      userId: input.userId,
      phase: "pre_deploy",
      report: {
        ...report,
        logs: [
          ...report.logs,
          {
            at: new Date().toISOString(),
            event: "deploy.gate",
            meta: { mode, autofix: applied },
          },
        ],
      },
    });
  } catch {
    /* tabla puede no existir aún */
  }

  if (report.approved) {
    const warn =
      report.status === "approved_with_warnings"
        ? `Calidad ${report.overallScore}/100 — publicación con avisos menores.`
        : applied.length > 0
          ? `Auto-fix aplicado (${applied.length}) antes de publicar.`
          : undefined;
    return {
      allowed: true,
      warning: warn,
      overallScore: report.overallScore,
      status: report.status,
    };
  }

  const msg = `Publicación bloqueada: calidad ${report.overallScore}/100. Corrige los errores en el chat (Construir) y vuelve a publicar.`;
  if (mode === "soft") {
    return {
      allowed: true,
      warning: msg,
      overallScore: report.overallScore,
      status: report.status,
    };
  }

  return {
    allowed: false,
    message: msg,
    overallScore: report.overallScore,
    status: report.status,
  };
}
