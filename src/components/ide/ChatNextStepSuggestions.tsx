import { useEffect, useRef, useState } from "react";
import type { GafcoreChatNextStep } from "@/lib/gafcore-chat-suggestions.shared";
import { cn } from "@/lib/utils";
import {
  Lightbulb,
  Code2,
  FormInput,
  Navigation,
  Database,
  Github,
  Globe,
  Circle,
  Zap,
  AlertTriangle,
  ShoppingCart,
  CreditCard,
  User,
  Layout,
  Search,
  FileText,
} from "lucide-react";

type Props = {
  steps: GafcoreChatNextStep[];
  messageCount: number;
  disabled?: boolean;
  onSelect: (step: GafcoreChatNextStep) => void;
};

function stepIcon(id: string, label: string) {
  if (/fix|error|⚠|corregir/i.test(label)) return <AlertTriangle className="h-3 w-3 shrink-0" />;
  if (id.startsWith("deploy-supabase")) return <Database className="h-3 w-3 shrink-0" />;
  if (id.startsWith("deploy-github")) return <Github className="h-3 w-3 shrink-0" />;
  if (id.startsWith("deploy-vercel")) return <Globe className="h-3 w-3 shrink-0" />;
  if (id.startsWith("feat-catalog") || id.startsWith("feat-menu")) {
    return <Layout className="h-3 w-3 shrink-0" />;
  }
  if (id.startsWith("feat-cart") || id.startsWith("feat-orders")) {
    return <ShoppingCart className="h-3 w-3 shrink-0" />;
  }
  if (id.startsWith("feat-stripe") || id.startsWith("feat-payments")) {
    return <CreditCard className="h-3 w-3 shrink-0" />;
  }
  if (id.startsWith("feat-auth") || id.startsWith("feat-account") || id.startsWith("feat-profile")) {
    return <User className="h-3 w-3 shrink-0" />;
  }
  if (id.startsWith("feat-search")) return <Search className="h-3 w-3 shrink-0" />;
  if (id.startsWith("feat-post")) return <FileText className="h-3 w-3 shrink-0" />;
  if (id.startsWith("feat-hero")) return <Lightbulb className="h-3 w-3 shrink-0" />;
  if (id.startsWith("feat-features")) return <Zap className="h-3 w-3 shrink-0" />;
  if (id.startsWith("feat-contact")) return <FormInput className="h-3 w-3 shrink-0" />;
  if (id.startsWith("feat-dashboard")) return <Code2 className="h-3 w-3 shrink-0" />;
  if (id.startsWith("feat-checkout") || id.startsWith("feat-reservations")) {
    return <Navigation className="h-3 w-3 shrink-0" />;
  }
  return <Circle className="h-3 w-3 shrink-0" />;
}

function shortLabel(label: string): string {
  return label.replace(/^\d+\.\s*|^⚠\s*/, "").trim();
}

function chipButtonClass(opts: {
  isCurrent: boolean;
  isError: boolean;
  isExiting: boolean;
  isEntering: boolean;
  enterReady: boolean;
}) {
  const { isCurrent, isError, isExiting, isEntering, enterReady } = opts;
  return cn(
    "shrink-0 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium leading-tight shadow-sm transition-all duration-300 ease-out",
    "disabled:cursor-not-allowed disabled:opacity-45",
    isExiting && "pointer-events-none opacity-0 -translate-x-full",
    isEntering && !enterReady && "opacity-100 -translate-x-full",
    isEntering && enterReady && "opacity-100 translate-x-0",
    !isExiting && !isEntering && "opacity-100 translate-x-0",
    isError && "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15",
    !isError && isCurrent && "border-primary/60 bg-primary/10 text-foreground ring-1 ring-primary/30 shadow-primary/10",
    !isError && !isCurrent && "border-border/70 bg-muted/40 text-muted-foreground hover:border-primary/40 hover:bg-primary/8 hover:text-foreground",
  );
}

/** Chips de pasos guiados encima del recuadro del chat */
export function ChatNextStepSuggestions({
  steps,
  messageCount,
  disabled,
  onSelect,
}: Props) {
  const [exitingChips, setExitingChips] = useState<GafcoreChatNextStep[]>([]);
  const [exitAnimatingIds, setExitAnimatingIds] = useState<Set<string>>(new Set());
  const [enteringId, setEnteringId] = useState<string | null>(null);
  const [enterReady, setEnterReady] = useState(false);
  const prevStepsRef = useRef<GafcoreChatNextStep[]>(steps);

  useEffect(() => {
    const prev = prevStepsRef.current;
    const justCompleted = prev.filter((p) => {
      if (p.status !== "current") return false;
      const now = steps.find((s) => s.id === p.id);
      return now?.status === "completed";
    });

    if (justCompleted.length > 0) {
      setExitingChips((ec) => {
        const ids = new Set(justCompleted.map((c) => c.id));
        return [...ec.filter((c) => !ids.has(c.id)), ...justCompleted];
      });

      for (const chip of justCompleted) {
        requestAnimationFrame(() => {
          setExitAnimatingIds((ids) => new Set([...ids, chip.id]));
        });
        window.setTimeout(() => {
          setExitingChips((ec) => ec.filter((c) => c.id !== chip.id));
          setExitAnimatingIds((ids) => {
            const next = new Set(ids);
            next.delete(chip.id);
            return next;
          });
        }, 300);
      }

      const newCurrent = steps.find((s) => s.status === "current");
      if (newCurrent) {
        setEnteringId(newCurrent.id);
        setEnterReady(false);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setEnterReady(true));
        });
        window.setTimeout(() => {
          setEnteringId(null);
          setEnterReady(false);
        }, 300);
      }
    }

    prevStepsRef.current = steps;
  }, [steps]);

  if (messageCount === 0) return null;

  const pendingSteps = steps.filter((s) => s.status !== "completed");
  if (pendingSteps.length === 0 && exitingChips.length === 0) return null;

  const current = pendingSteps.find((s) => s.status === "current");
  const upcoming = pendingSteps.filter((s) => s.status === "upcoming");

  return (
    <div className="mb-2 min-w-0">
      <div
        className="flex flex-row items-center gap-1.5 overflow-x-auto overscroll-x-contain pb-0.5 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="group"
        aria-label="Pasos para completar tu proyecto"
      >
        {(current || exitingChips.length > 0) && (
          <div className="relative shrink-0">
            {exitingChips.map((step) => {
              const isError = /fix|error|⚠|corregir/i.test(step.label);
              const isAnimating = exitAnimatingIds.has(step.id);
              return (
                <button
                  key={`exit-${step.id}`}
                  type="button"
                  disabled
                  title={step.prompt.slice(0, 120)}
                  className={cn(
                    chipButtonClass({
                      isCurrent: true,
                      isError,
                      isExiting: isAnimating,
                      isEntering: false,
                      enterReady: false,
                    }),
                    "absolute left-0 top-0 z-10",
                  )}
                >
                  {stepIcon(step.id, step.label)}
                  <span>{shortLabel(step.label)}</span>
                </button>
              );
            })}
            {current ? (
              <button
                key={current.id}
                type="button"
                disabled={disabled}
                title={current.prompt.slice(0, 120)}
                onClick={() => onSelect(current)}
                className={chipButtonClass({
                  isCurrent: true,
                  isError: /fix|error|⚠|corregir/i.test(current.label),
                  isExiting: false,
                  isEntering: enteringId === current.id,
                  enterReady,
                })}
              >
                {stepIcon(current.id, current.label)}
                <span>{shortLabel(current.label)}</span>
                {!/fix|error|⚠|corregir/i.test(current.label) && (
                  <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                )}
              </button>
            ) : null}
          </div>
        )}

        {upcoming.map((step) => {
          const isError = /fix|error|⚠|corregir/i.test(step.label);
          return (
            <button
              key={step.id}
              type="button"
              disabled={disabled}
              title={step.prompt.slice(0, 120)}
              onClick={() => onSelect(step)}
              className={chipButtonClass({
                isCurrent: false,
                isError,
                isExiting: false,
                isEntering: false,
                enterReady: false,
              })}
            >
              {stepIcon(step.id, step.label)}
              <span>{shortLabel(step.label)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
