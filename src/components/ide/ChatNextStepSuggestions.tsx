import type { GafcoreChatNextStep } from "@/lib/gafcore-chat-suggestions.shared";

type Props = {
  steps: GafcoreChatNextStep[];
  disabled?: boolean;
  /** Rellena el compositor con el prompt (no envía; el usuario pulsa Construir). */
  onSelect: (step: GafcoreChatNextStep) => void;
};

/** Chips de sugerencias encima del compositor (solo con proyecto ya creado en el IDE). */
export function ChatNextStepSuggestions({ steps, disabled, onSelect }: Props) {
  if (steps.length === 0) return null;

  return (
    <div className="mb-2 min-w-0">
      <div
        className="flex gap-1.5 overflow-x-auto overscroll-x-contain pb-0.5 [-webkit-overflow-scrolling:touch]"
        role="group"
        aria-label="Sugerencias para mejorar tu proyecto"
      >
        {steps.map((step) => (
          <button
            key={step.id}
            type="button"
            disabled={disabled}
            title={step.prompt}
            onClick={() => onSelect(step)}
            className="shrink-0 rounded-full border border-border/80 bg-muted/50 px-3 py-1.5 text-[11.5px] font-medium leading-tight text-foreground shadow-sm transition hover:border-primary/45 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {step.label}
          </button>
        ))}
      </div>
    </div>
  );
}
