import type { GafcoreChatNextStep } from "@/lib/gafcore-chat-suggestions.shared";
import { getRecommendedNextStep } from "@/lib/gafcore-chat-suggestions.shared";
import { cn } from "@/lib/utils";

type Props = {
  steps: GafcoreChatNextStep[];
  disabled?: boolean;
  /** Rellena el compositor con el prompt (no envía; el usuario pulsa Construir). */
  onSelect: (step: GafcoreChatNextStep) => void;
  autopilotStatus?: string | null;
};

/** Chips horizontales encima del recuadro de escritura (no dentro del hilo del chat). */
export function ChatNextStepSuggestions({
  steps,
  disabled,
  onSelect,
  autopilotStatus,
}: Props) {
  if (steps.length === 0) return null;

  const recommended = getRecommendedNextStep(steps);
  const completedCount = steps.filter((s) => s.status === "completed").length;

  return (
    <div className="mb-2 min-w-0" aria-label="Pasos del proyecto">
      {autopilotStatus ? (
        <p className="mb-1.5 line-clamp-2 text-[10px] font-medium leading-snug text-primary">
          {autopilotStatus}
        </p>
      ) : recommended ? (
        <p className="mb-1.5 text-[10px] leading-snug text-muted-foreground">
          <span className="font-medium text-foreground">
            Siguiente: {recommended.label.replace(/^\d+\.\s*|^⚠\s*/, "")}
          </span>
          {" · "}
          {completedCount}/{steps.length} completados
        </p>
      ) : null}
      <div
        className="flex gap-1.5 overflow-x-auto overscroll-x-contain pb-0.5 [-webkit-overflow-scrolling:touch]"
        role="group"
        aria-label="Sugerencias para continuar tu proyecto"
      >
        {steps.map((step) => {
          const isCurrent = step.status === "current";
          const isDone = step.status === "completed";
          return (
            <button
              key={step.id}
              type="button"
              disabled={disabled}
              title={step.prompt}
              onClick={() => onSelect(step)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-[11.5px] font-medium leading-tight shadow-sm transition",
                "disabled:cursor-not-allowed disabled:opacity-45",
                isDone &&
                  "border-border/50 bg-muted/35 text-muted-foreground opacity-80",
                isCurrent &&
                  "border-primary/55 bg-primary/10 text-foreground ring-1 ring-primary/30",
                !isDone &&
                  !isCurrent &&
                  "border-border/80 bg-muted/50 text-foreground hover:border-primary/45 hover:bg-primary/10",
              )}
            >
              {step.label.replace(/^\d+\.\s*/, "")}
            </button>
          );
        })}
      </div>
    </div>
  );
}
