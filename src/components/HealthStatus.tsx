import { Sparkles } from "lucide-react";
import {
  healthStatusLabel,
  mapSafeBuildToHealthPhase,
  type HealthStatusPhase,
  type SafeBuildPhase,
} from "@/services/ai/safe-build.shared";

type HealthStatusProps = {
  /** Fase activa; null/idle no renderiza nada. */
  phase?: HealthStatusPhase | SafeBuildPhase | null;
  /** Etiqueta personalizada (p. ej. plantilla Movilidad). */
  label?: string;
  className?: string;
};

/**
 * Indicador discreto de trabajo del cerebro (diseño / validación / reparación).
 * Estilo marca: tokens semánticos, sin colores hard-coded.
 */
export function HealthStatus({ phase, label: labelOverride, className = "" }: HealthStatusProps) {
  if (!phase || phase === "idle" || phase === "ready") return null;

  const displayPhase =
    phase === "designing" || phase === "repairing" || phase === "validating"
      ? mapSafeBuildToHealthPhase(phase as SafeBuildPhase)
      : phase;

  const label = labelOverride?.trim() || healthStatusLabel(displayPhase);
  if (!label) return null;

  const isRepair = displayPhase === "fixing_error";

  return (
    <div
      className={`inline-flex max-w-full items-center gap-2 rounded-full border border-border/50 bg-muted/30 px-2.5 py-1 text-[10px] text-muted-foreground backdrop-blur-sm ${className}`}
      role="status"
      aria-live="polite"
    >
      <span
        className={`inline-flex size-1.5 shrink-0 rounded-full ${
          isRepair ? "animate-pulse bg-destructive/80" : "animate-pulse bg-primary/80"
        }`}
      />
      <Sparkles className="size-3 shrink-0 text-primary/70" aria-hidden />
      <span className="truncate font-medium tracking-tight">{label}</span>
    </div>
  );
}
