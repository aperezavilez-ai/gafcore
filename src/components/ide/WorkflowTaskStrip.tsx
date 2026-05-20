import { CheckCircle2, Circle, Loader2, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { agentTypeLabel } from "@/tasks/artifacts.shared";
import type { AgentType } from "@/tasks/types";

export type WorkflowTaskUi = {
  id: string;
  agent_type: AgentType | string;
  state: string;
  title: string;
  error_message?: string | null;
};

function stateIcon(state: string) {
  if (state === "succeeded") {
    return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />;
  }
  if (state === "failed" || state === "cancelled") {
    return <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />;
  }
  if (state === "running") {
    return <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" aria-hidden />;
  }
  return <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />;
}

const CANCELLABLE_WORKFLOW_STATES = new Set(["planning", "executing", "validating", "merging"]);

export type WorkflowMetricsUi = {
  run?: {
    taskCounts?: {
      total: number;
      succeeded: number;
      failed: number;
      running: number;
    };
    durationMs?: number | null;
  };
  quota?: { active: number; max: number };
};

type Props = {
  tasks: WorkflowTaskUi[];
  planSummary?: string | null;
  workflowState?: string | null;
  metrics?: WorkflowMetricsUi | null;
  className?: string;
  onCancel?: () => void;
  cancelPending?: boolean;
};

export function WorkflowTaskStrip({
  tasks,
  planSummary,
  workflowState,
  metrics,
  className,
  onCancel,
  cancelPending,
}: Props) {
  if (tasks.length === 0 && !planSummary) return null;

  const done = tasks.filter((t) => t.state === "succeeded").length;
  const total = tasks.length;
  const canCancel =
    !!onCancel &&
    !!workflowState &&
    CANCELLABLE_WORKFLOW_STATES.has(workflowState) &&
    workflowState !== "cancelled";

  return (
    <div
      className={
        "rounded-lg border border-border bg-muted/30 px-3 py-2 text-[11px] " + (className ?? "")
      }
      role="status"
      aria-live="polite"
    >
      {planSummary ? (
        <p className="mb-1.5 line-clamp-2 text-muted-foreground">
          <span className="font-medium text-foreground">Plan:</span> {planSummary}
        </p>
      ) : null}
      {metrics?.quota || metrics?.run?.durationMs != null ? (
        <p className="mb-1.5 text-muted-foreground">
          {metrics.quota ? (
            <span>
              Workflows activos: {metrics.quota.active}/{metrics.quota.max}
            </span>
          ) : null}
          {metrics.run?.durationMs != null ? (
            <span className={metrics.quota ? " · " : ""}>
              {Math.round(metrics.run.durationMs / 1000)}s
            </span>
          ) : null}
          {metrics.run?.taskCounts && metrics.run.taskCounts.total > 0 ? (
            <span>
              {" "}
              · {metrics.run.taskCounts.succeeded}/{metrics.run.taskCounts.total} OK
              {metrics.run.taskCounts.failed > 0
                ? ` · ${metrics.run.taskCounts.failed} fallo(s)`
                : ""}
            </span>
          ) : null}
        </p>
      ) : null}
      {workflowState ? (
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="font-medium text-foreground">
            Workflow: {workflowState}
            {total > 0 ? (
              <span className="ml-1 font-normal text-muted-foreground">
                ({done}/{total} tareas)
              </span>
            ) : null}
          </p>
          {canCancel ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 shrink-0 px-2 text-[10px] text-muted-foreground hover:text-destructive"
              disabled={cancelPending}
              onClick={onCancel}
            >
              <X className="mr-1 h-3 w-3" />
              Cancelar
            </Button>
          ) : null}
        </div>
      ) : null}
      <ul className="space-y-1">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-start gap-1.5">
            {stateIcon(t.state)}
            <span className="min-w-0 flex-1">
              <span className="font-medium text-foreground">
                {agentTypeLabel(t.agent_type as AgentType)}
              </span>
              <span className="text-muted-foreground"> · {t.title}</span>
              {t.error_message ? (
                <span className="block text-destructive">{t.error_message.slice(0, 120)}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
