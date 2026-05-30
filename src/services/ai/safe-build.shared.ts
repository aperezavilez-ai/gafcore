/**
 * Fases del loop Safe-Build (cliente + servidor).
 */
export type SafeBuildPhase =
  | "idle"
  | "designing"
  | "validating"
  | "repairing"
  | "ready";

export type SafeBuildMeta = {
  phase: SafeBuildPhase;
  repaired: boolean;
  skipped?: boolean;
};

export type HealthStatusPhase =
  | SafeBuildPhase
  | "optimizing_design"
  | "fixing_error"
  | "recalibrating_route";

export function mapSafeBuildToHealthPhase(phase: SafeBuildPhase): HealthStatusPhase {
  if (phase === "designing") return "optimizing_design";
  if (phase === "repairing") return "fixing_error";
  if (phase === "validating") return "validating";
  return phase;
}

export function healthStatusLabel(phase: HealthStatusPhase | null | undefined): string {
  switch (phase) {
    case "optimizing_design":
    case "designing":
      return "Optimizando el diseño";
    case "validating":
      return "Validando calidad del código";
    case "fixing_error":
    case "repairing":
      return "Corrigiendo un error técnico";
    case "recalibrating_route":
      return "Recalibrando la ruta";
    case "ready":
      return "Listo";
    default:
      return "";
  }
}
