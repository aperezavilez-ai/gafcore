import { useState } from "react";
import type { GafcoreChatNextStep } from "@/lib/gafcore-chat-suggestions.shared";
import { getRecommendedNextStep } from "@/lib/gafcore-chat-suggestions.shared";
import { cn } from "@/lib/utils";
import {
  Lightbulb, Code2, FormInput, Navigation, Zap, CheckCircle2,
  Database, Github, Globe, AlertTriangle, CreditCard, Map,
  Mail, Lock, Upload, BarChart2, ChevronDown, ChevronUp, Bell,
} from "lucide-react";

type Props = {
  steps: GafcoreChatNextStep[];
  disabled?: boolean;
  onSelect: (step: GafcoreChatNextStep) => void;
  autopilotStatus?: string | null;
  panelLabel?: string;
};

function stepIcon(id: string, label: string) {
  if (/fix|error|⚠/i.test(label))          return <AlertTriangle className="h-3 w-3 shrink-0" />;
  if (id === "guide-1")                      return <Lightbulb className="h-3 w-3 shrink-0" />;
  if (id === "guide-2")                      return <Code2 className="h-3 w-3 shrink-0" />;
  if (id === "guide-3")                      return <FormInput className="h-3 w-3 shrink-0" />;
  if (id === "guide-4")                      return <Navigation className="h-3 w-3 shrink-0" />;
  if (id === "guide-5")                      return <Zap className="h-3 w-3 shrink-0" />;
  if (id === "guide-6")                      return <CheckCircle2 className="h-3 w-3 shrink-0" />;
  if (id === "guide-supabase")               return <Database className="h-3 w-3 shrink-0" />;
  if (id === "guide-github")                 return <Github className="h-3 w-3 shrink-0" />;
  if (id === "guide-vercel")                 return <Globe className="h-3 w-3 shrink-0" />;
  if (id === "integration-stripe")           return <CreditCard className="h-3 w-3 shrink-0" />;
  if (id === "integration-maps")             return <Map className="h-3 w-3 shrink-0" />;
  if (id === "integration-email")            return <Mail className="h-3 w-3 shrink-0" />;
  if (id === "integration-auth")             return <Lock className="h-3 w-3 shrink-0" />;
  if (id === "integration-storage")          return <Upload className="h-3 w-3 shrink-0" />;
  if (id === "integration-analytics")        return <BarChart2 className="h-3 w-3 shrink-0" />;
  if (id === "integration-push")             return <Bell className="h-3 w-3 shrink-0" />;
  return <CheckCircle2 className="h-3 w-3 shrink-0" />;
}

function shortLabel(label: string): string {
  return label.replace(/^\d+\.\s*|^⚠\s*/, "").trim();
}

export function ChatNextStepSuggestions({
  steps,
  disabled,
  onSelect,
  autopilotStatus,
}: Props) {
  const [showAll, setShowAll] = useState(false);

  const completedSteps = steps.filter(s => s.status === "completed");
  const pendingSteps = steps.filter(s => s.status !== "completed");
  const recommended = getRecommendedNextStep(steps);
  const totalCount = steps.length;
  const completedCount = completedSteps.length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Mostrar solo el paso actual + 2 siguientes por defecto
  const visibleSteps = showAll ? pendingSteps : pendingSteps.slice(0, 3);

  if (pendingSteps.length === 0 && !autopilotStatus) return null;

  return (
    <div className="mb-2 space-y-1.5">

      {/* Barra de progreso */}
      {totalCount > 1 && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary/60 transition-all duration-700"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
            {completedCount}/{totalCount}
          </span>
        </div>
      )}

      {/* Estado del autopilot */}
      {autopilotStatus && (
        <p className="text-[10px] font-medium text-primary leading-snug line-clamp-1">
          {autopilotStatus}
        </p>
      )}

      {/* Chips de pasos */}
      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label="Pasos para completar tu proyecto"
      >
        {visibleSteps.map((step) => {
          const isCurrent = step.status === "current";
          const isError = /fix|error|⚠/i.test(step.label);
          const isIntegration = step.id.startsWith("integration-");
          const isPublish = ["guide-github", "guide-vercel", "guide-supabase"].includes(step.id);

          return (
            <button
              key={step.id}
              type="button"
              disabled={disabled}
              title={step.prompt.slice(0, 140)}
              onClick={() => onSelect(step)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium leading-tight transition-all",
                "disabled:cursor-not-allowed disabled:opacity-40",
                // Error
                isError && "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15",
                // Paso actual (resaltado con punto pulsante)
                !isError && isCurrent && "border-primary/60 bg-primary/10 text-foreground ring-1 ring-primary/30",
                // Integración especial
                !isError && !isCurrent && isIntegration && "border-violet-400/40 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/30",
                // Publicación
                !isError && !isCurrent && isPublish && "border-emerald-400/40 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30",
                // Siguiente paso normal
                !isError && !isCurrent && !isIntegration && !isPublish && "border-border/70 bg-muted/40 text-muted-foreground hover:border-primary/40 hover:bg-primary/8 hover:text-foreground",
              )}
            >
              {stepIcon(step.id, step.label)}
              <span>{shortLabel(step.label)}</span>
              {isCurrent && !isError && (
                <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-primary animate-pulse shrink-0" />
              )}
            </button>
          );
        })}

        {/* Botón ver más/menos */}
        {pendingSteps.length > 3 && (
          <button
            type="button"
            onClick={() => setShowAll(v => !v)}
            className="flex items-center gap-1 rounded-full border border-border/50 px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:border-border transition-colors"
          >
            {showAll ? (
              <><ChevronUp className="h-2.5 w-2.5" /> Menos</>
            ) : (
              <><ChevronDown className="h-2.5 w-2.5" /> +{pendingSteps.length - 3} más</>
            )}
          </button>
        )}
      </div>

    </div>
  );
}
