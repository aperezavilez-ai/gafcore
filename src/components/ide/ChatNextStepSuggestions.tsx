import { Check, ChevronRight, Lightbulb } from "lucide-react";
import type { GafcoreChatNextStep } from "@/lib/gafcore-chat-suggestions.shared";
import { getRecommendedNextStep } from "@/lib/gafcore-chat-suggestions.shared";
import { cn } from "@/lib/utils";

type Props = {
  steps: GafcoreChatNextStep[];
  disabled?: boolean;
  /** Rellena el compositor con el prompt (no envía; el usuario pulsa Construir). */
  onSelect: (step: GafcoreChatNextStep) => void;
};

/**
 * Guía completa encima del compositor del chat.
 */
export function ChatNextStepSuggestions({ steps, disabled, onSelect }: Props) {
  if (steps.length === 0) return null;

  const recommended = getRecommendedNextStep(steps);
  const completedCount = steps.filter((s) => s.status === "completed").length;

  return (
    <section
      className="shrink-0 border-t border-border/60 bg-muted/25 px-2 py-2.5 md:px-3"
      aria-label="Guía para crear tu proyecto"
    >
      <div className="mb-2 flex items-start gap-2">
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Lightbulb className="size-3.5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-foreground">Guía del proyecto</p>
          <p className="text-[10px] leading-snug text-muted-foreground">
            {recommended ? (
              <>
                <span className="font-medium text-foreground">
                  Siguiente: {recommended.label.replace(/^\d+\.\s*|^⚠\s*/, "")}
                </span>
                {" · "}
                {completedCount}/{steps.length} completados. Pulsa un paso → se carga el prompt abajo →
                envía con <span className="font-medium">Construir</span>.
              </>
            ) : (
              "Pulsa un paso para cargar el prompt en el recuadro de abajo."
            )}
          </p>
        </div>
      </div>

      <div
        className="max-h-[min(42vh,280px)] space-y-1 overflow-y-auto overscroll-contain pr-0.5"
        role="list"
        aria-label="Pasos para crear el proyecto"
      >
        {steps.map((step) => {
          const isCurrent = step.status === "current";
          const isDone = step.status === "completed";
          return (
            <button
              key={step.id}
              type="button"
              disabled={disabled}
              title={isDone ? `Completado — pulsa para reutilizar el prompt` : step.prompt}
              onClick={() => onSelect(step)}
              role="listitem"
              className={cn(
                "flex w-full min-w-0 items-start gap-2 rounded-xl border px-3 py-2 text-left text-[11px] font-medium leading-snug transition",
                "disabled:cursor-not-allowed",
                isDone &&
                  "border-border/40 bg-background/30 text-muted-foreground opacity-70",
                isCurrent &&
                  "border-primary/55 bg-primary/10 text-foreground shadow-sm ring-1 ring-primary/30",
                !isDone &&
                  !isCurrent &&
                  "border-border/70 bg-background/70 text-foreground hover:border-primary/45 hover:bg-primary/5",
              )}
            >
              {isDone ? (
                <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
              ) : isCurrent ? (
                <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
              ) : (
                <span className="mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full border border-border text-[9px] text-muted-foreground">
                  {step.order}
                </span>
              )}
              <span className="min-w-0 flex-1 whitespace-normal">{step.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
