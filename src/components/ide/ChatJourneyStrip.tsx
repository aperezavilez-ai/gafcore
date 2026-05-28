import { Check, Globe, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  GAFCORE_JOURNEY_STEPS,
  journeyPhaseHint,
  journeyPhaseStepIndex,
  type GafcoreJourneyPhaseId,
} from "@/lib/gafcore-journey-phase.shared";
import { cn } from "@/lib/utils";

type Props = {
  phase: GafcoreJourneyPhaseId;
  deploySiteHost?: string | null;
  className?: string;
  onPublish?: () => void;
  publishing?: boolean;
};

export function ChatJourneyStrip({
  phase,
  deploySiteHost,
  className,
  onPublish,
  publishing,
}: Props) {
  const activeIdx = journeyPhaseStepIndex(phase);
  const hint = journeyPhaseHint(phase, deploySiteHost ?? null);
  const showPublishCta =
    (phase === "ready" || phase === "issue") && Boolean(onPublish);

  return (
    <div
      className={cn(
        "rounded-lg border border-border/60 bg-muted/25 px-2.5 py-2",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label="Progreso del proyecto"
    >
      <div className="flex items-center gap-0.5 sm:gap-1">
        {GAFCORE_JOURNEY_STEPS.map((step, idx) => {
          const done = idx < activeIdx;
          const current = idx === activeIdx;
          const isIssueOnStep = phase === "issue" && idx === 3;
          return (
            <div key={step.id} className="flex min-w-0 flex-1 items-center">
              <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5">
                <div
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[9px] font-semibold transition-colors",
                    done && "border-primary/40 bg-primary/15 text-primary",
                    current &&
                      !isIssueOnStep &&
                      "border-primary bg-primary/20 text-primary ring-2 ring-primary/25",
                    current &&
                      isIssueOnStep &&
                      "border-amber-500/60 bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-2 ring-amber-500/20",
                    !done &&
                      !current &&
                      "border-border/80 bg-background/80 text-muted-foreground",
                  )}
                >
                  {done ? (
                    <Check className="h-2.5 w-2.5" aria-hidden />
                  ) : current && phase === "building" ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden />
                  ) : current && phase === "published" && idx === 4 ? (
                    <Globe className="h-2.5 w-2.5" aria-hidden />
                  ) : current && isIssueOnStep ? (
                    <AlertTriangle className="h-2.5 w-2.5" aria-hidden />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>
                <span
                  className={cn(
                    "max-w-full truncate text-[9px] font-medium leading-none",
                    current ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
              </div>
              {idx < GAFCORE_JOURNEY_STEPS.length - 1 ? (
                <div
                  className={cn(
                    "mx-0.5 h-px min-w-[4px] flex-1 self-center rounded-full sm:mx-1",
                    idx < activeIdx ? "bg-primary/50" : "bg-border/80",
                  )}
                  aria-hidden
                />
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">{hint}</p>
      {showPublishCta ? (
        <Button
          type="button"
          size="sm"
          variant="default"
          className="mt-2 h-7 w-full text-[11px] font-medium"
          disabled={publishing}
          onClick={onPublish}
        >
          {publishing ? (
            <>
              <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              Publicando…
            </>
          ) : (
            <>
              <Globe className="mr-1.5 h-3 w-3" />
              Publicar ahora
            </>
          )}
        </Button>
      ) : null}
      {phase === "published" && deploySiteHost ? (
        <a
          href={`https://${deploySiteHost.replace(/^https?:\/\//, "")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1.5 block truncate text-center text-[10px] font-medium text-primary hover:underline"
        >
          Abrir {deploySiteHost}
        </a>
      ) : null}
    </div>
  );
}
