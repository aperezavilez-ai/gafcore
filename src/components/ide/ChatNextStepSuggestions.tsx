import type { GafcoreChatNextStep } from "@/lib/gafcore-chat-suggestions.shared";
import { getRecommendedNextStep } from "@/lib/gafcore-chat-suggestions.shared";
import { cn } from "@/lib/utils";
import {
  Lightbulb, Code2, FormInput, Navigation, Database,
  Github, Globe, CheckCircle2, Circle, Zap, AlertTriangle, ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  steps: GafcoreChatNextStep[];
  disabled?: boolean;
  onSelect: (step: GafcoreChatNextStep) => void;
  autopilotStatus?: string | null;
  panelLabel?: string;
};

// Ícono por paso
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

// Etiqueta corta sin número
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
  const visibleSteps = steps.filter((s) => s.status !== "completed");
  if (visibleSteps.length === 0 && !autopilotStatus) return null;

  const recommended = getRecommendedNextStep(steps);
  const completedCount = steps.filter((s) => s.status === "completed").length;
  const totalCount = steps.length;
  const recommendedLabel = recommended ? shortLabel(recommended.label) : null;

  return (
    <div className="mb-2 min-w-0 space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-1 rounded-full bg-primary/60 transition-all duration-500"
            style={{ width: `${Math.round((completedCount / Math.max(totalCount, 1)) * 100)}%` }}
          />
        </div>
        <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
          {completedCount}/{totalCount}
        </span>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className="flex w-full min-w-0 items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-2.5 py-1.5 text-left transition hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-45"
            aria-label="Ver pasos del workflow"
          >
            <div className="min-w-0 flex-1">
              {autopilotStatus ? (
                <p className="truncate text-[10px] font-medium text-primary">{autopilotStatus}</p>
              ) : recommendedLabel ? (
                <p className="truncate text-[10px] text-muted-foreground">
                  <span className="font-medium text-foreground">Siguiente →</span> {recommendedLabel}
                </p>
              ) : (
                <p className="truncate text-[10px] text-muted-foreground">
                  Workflow del proyecto · {visibleSteps.length} paso(s) pendiente(s)
                </p>
              )}
            </div>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="max-h-[min(50vh,320px)] w-[min(92vw,20rem)] overflow-y-auto">
          {visibleSteps.map((step) => {
            const isCurrent = step.status === "current";
            const isError = /fix|error|⚠|corregir/i.test(step.label);
            return (
              <DropdownMenuItem
                key={step.id}
                disabled={disabled}
                title={step.prompt.slice(0, 120)}
                onSelect={() => onSelect(step)}
                className={cn(
                  "flex items-center gap-2 text-[11px]",
                  isError && "text-destructive focus:text-destructive",
                  isCurrent && !isError && "font-medium",
                )}
              >
                {stepIcon(step.id, step.label)}
                <span className="min-w-0 flex-1 truncate">{shortLabel(step.label)}</span>
                {isCurrent && !isError ? (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                ) : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
