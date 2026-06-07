import type { GafcoreChatNextStep } from "@/lib/gafcore-chat-suggestions.shared";
import type { WorkflowTaskUi } from "@/components/ide/WorkflowTaskStrip";
import {
  formatOrchestrationStatusLine,
  type ProjectOrchestrationState,
} from "@/core/orchestration/project-state.shared";
import {
  mapWorkflowTasksToPanelSteps,
  workflowPanelProgress,
} from "@/core/orchestration/workflow-panel.shared";

export function buildOrchestrationNextSteps(
  workflowRunId: string | null,
  tasks: WorkflowTaskUi[],
  multiAgentMode: boolean,
  factoryMode: boolean,
): GafcoreChatNextStep[] {
  if (!workflowRunId || tasks.length === 0 || multiAgentMode || factoryMode) {
    return [];
  }
  return mapWorkflowTasksToPanelSteps(tasks);
}

export function buildOrchestrationPanelStatus(
  workflowRunId: string | null,
  tasks: WorkflowTaskUi[],
  planSummary: string | null,
  orchestrationState: ProjectOrchestrationState | null,
): string | null {
  if (!workflowRunId || tasks.length === 0) return null;
  const { completed, total } = workflowPanelProgress(tasks);
  const integrationLine = formatOrchestrationStatusLine(orchestrationState);
  const head = planSummary
    ? `Workflow ${completed}/${total} · ${planSummary.slice(0, 70)}`
    : `Workflow ${completed}/${total} tareas`;
  return integrationLine ? `${head} · ${integrationLine}` : head;
}
