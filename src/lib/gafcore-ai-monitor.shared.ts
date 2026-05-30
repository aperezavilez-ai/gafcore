/** Detector de errores en código generado por IA (admin ops). */

export type AiMonitorVisualStatus = "stable" | "risk" | "error";

export type ValidarIAEstado = "OK" | "ERROR";

/** Contrato principal de validarIA(). */
export type ValidarIAResult = {
  estado: ValidarIAEstado;
  errores: number;
  mensaje: string;
};

export type AiMonitorCheck = {
  id: string;
  name: string;
  ok: boolean;
  detail: string;
};

export type ValidarIAFullResult = ValidarIAResult & {
  visualStatus: AiMonitorVisualStatus;
  advertencia: boolean;
  validatedAt: string;
  checks: AiMonitorCheck[];
};

export type AiMonitorLastValidation = {
  validatedAt: string;
  estado: ValidarIAEstado;
  errores: number;
  visualStatus: AiMonitorVisualStatus;
  advertencia: boolean;
  mensaje: string;
};

export type AiMonitorSessionEntry = {
  at: string;
  estado: ValidarIAEstado;
  errores: number;
};

export type AiMonitorSession = {
  failCount: number;
  history: AiMonitorSessionEntry[];
};

export const AI_MONITOR_LAST_VALIDATION_STORAGE_KEY = "gafcore:ai-monitor:last-validation";
export const AI_MONITOR_SESSION_STORAGE_KEY = "gafcore:ai-monitor:session";
export const AI_MONITOR_FAIL_ALERT_THRESHOLD = 3;

export function aiMonitorVisualLabel(status: AiMonitorVisualStatus): string {
  if (status === "stable") return "Estable";
  if (status === "risk") return "Advertencia";
  return "Error";
}

export function aiMonitorVisualEmoji(status: AiMonitorVisualStatus): string {
  if (status === "stable") return "🟢";
  if (status === "risk") return "🟡";
  return "🔴";
}

export function formatAiMonitorValidatedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function deriveVisualStatus(
  errores: number,
  advertencia: boolean,
): AiMonitorVisualStatus {
  if (errores > 0) return "error";
  if (advertencia) return "risk";
  return "stable";
}

export function estadoToVisualStatus(
  estado: ValidarIAEstado,
  advertencia: boolean,
): AiMonitorVisualStatus {
  if (estado === "ERROR") return "error";
  if (advertencia) return "risk";
  return "stable";
}

export function aiMonitorStatusTone(
  status: AiMonitorVisualStatus,
): "ok" | "warn" | "error" {
  if (status === "stable") return "ok";
  if (status === "risk") return "warn";
  return "error";
}
