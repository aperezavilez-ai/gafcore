import type { GafcoreChatNextStep } from "@/lib/gafcore-chat-suggestions.shared";
import { getRecommendedNextStep } from "@/lib/gafcore-chat-suggestions.shared";
import { cn } from "@/lib/utils";
import {
  Lightbulb, Code2, FormInput, Navigation, Database,
  Github, Globe, CheckCircle2, Circle, Zap, AlertTriangle,
} from "lucide-react";

type Props = {
  steps: GafcoreChatNextStep[];
  disabled?: boolean;
  onSelect: (step: GafcoreChatNextStep) => void;
  autopilotStatus?: string | null;
  panelLabel?: string;
};

function isPendingLikeStatus(status: GafcoreChatNextStep["status"] | "pending"): boolean {
  return status === "upcoming" || status === "pending";
}

/** Chips solo tras empezar a construir (≥1 paso completado o paso de corrección activo). */
function shouldShowSuggestionChips(
  steps: GafcoreChatNextStep[],
  autopilotStatus?: string | null,
): boolean {
  if (steps.length === 0) return false;

  const hasCurrent = steps.some((s) => s.status === "current");
  const allPendingWithoutCurrent =
    !hasCurrent && steps.every((s) => isPendingLikeStatus(s.status as GafcoreChatNextStep["status"] | "pending"));
  if (allPendingWithoutCurrent) return false;

  if (autopilotStatus?.trim()) return true;

  if (steps.some((s) => s.status === "completed")) return true;

  return steps.some(
    (s) => s.id.startsWith("guide-fix") || /fix|error|⚠|corregir/i.test(s.label),
  );
}

function stepIcon(id: string, label: string) {
  if (/fix|error|⚠|corregir/i.test(label)) return <AlertTriangle className="h-3 w-3 shrink-0" />;
  if (id === "guide-1") return <Lightbulb className="h-3 w-3 shrink-0" />;
  if (id === "guide-2") return <Code2 className="h-3 w-3 shrink-0" />;
  if (id === "guide-3") return <FormInput className="h-3 w-3 shrink-0" />;
  if (id === "guide-4") return <Navigation className="h-3 w-3 shrink-0" />;
  if (id === "guide-5") return <Zap className="h-3 w-3 shrink-0" />;
  if (id === "guide-6") return <CheckCircle2 className="h-3 w-3 shrink-0" />;
  if (id === "guide-7") return <Database className="h-3 w-3 shrink-0" />;
  if (id === "guide-8") return <Github className="h-3 w-3 shrink-0" />;
  if (id === "guide-9") return <Globe className="h-3 w-3 shrink-0" />;
  return <Circle className="h-3 w-3 shrink-0" />;
}

function shortLabel(label: string): string {
  return label.replace(/^\d+\.\s*|^⚠\s*/, "").trim();
}

/** Chips de pasos guiados encima del recuadro del chat */
export function ChatNextStepSuggestions({
  steps,
  disabled,
  onSelect,
  autopilotStatus,
}: Props) {
  if (!shouldShowSuggestionChips(steps, autopilotStatus)) return null;

  const visibleSteps = steps.filter((s) => s.status !== "completed");
  if (visibleSteps.length === 0 && !autopilotStatus) return null;

  const recommended = getRecommendedNextStep(steps);

  return (
    <div className="mb-2 min-w-0 space-y-1.5">
      {autopilotStatus ? (
        <p className="text-[10px] font-medium text-primary leading-snug line-clamp-1">
          {autopilotStatus}
        </p>
      ) : recommended ? (
        <p className="text-[10px] text-muted-foreground leading-snug">
          <span className="font-medium text-foreground">Siguiente →</span>{" "}
          {shortLabel(recommended.label)}
        </p>
      ) : null}

      <div
        className="flex gap-1.5 overflow-x-auto overscroll-x-contain pb-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="group"
        aria-label="Pasos para completar tu proyecto"
      >
        {visibleSteps.map((step) => {
          const isCurrent = step.status === "current";
          const isError = /fix|error|⚠|corregir/i.test(step.label);
          return (
            <button
              key={step.id}
              type="button"
              disabled={disabled}
              title={step.prompt.slice(0, 120)}
              onClick={() => onSelect(step)}
              className={cn(
                "shrink-0 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium leading-tight shadow-sm transition-all",
                "disabled:cursor-not-allowed disabled:opacity-45",
                isError && "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15",
                !isError && isCurrent && "border-primary/60 bg-primary/10 text-foreground ring-1 ring-primary/30 shadow-primary/10",
                !isError && !isCurrent && "border-border/70 bg-muted/40 text-muted-foreground hover:border-primary/40 hover:bg-primary/8 hover:text-foreground",
              )}
            >
              {stepIcon(step.id, step.label)}
              <span>{shortLabel(step.label)}</span>
              {isCurrent && !isError && (
                <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
