import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import type { FileItem } from "@/components/ide/CodeEditor";
import type { WorkflowMetricsUi, WorkflowTaskUi } from "@/components/ide/WorkflowTaskStrip";
import {
  buildOrchestrationNextSteps,
  buildOrchestrationPanelStatus,
} from "@/core/orchestration/orchestration-panel.shared";
import {
  clearOrchestrationRunId,
  persistOrchestrationRunId,
  readOrchestrationRunId,
} from "@/core/orchestration/orchestration-storage.shared";
import {
  formatOrchestrationStatusLine,
  type ProjectOrchestrationState,
} from "@/core/orchestration/project-state.shared";
import { pickCurrentOrchestrationTask } from "@/core/orchestration/workflow-panel.shared";
import {
  getProjectOrchestrationState,
  syncProjectOrchestrationState,
  verifyProjectDeploymentStep,
} from "@/lib/gafcore-project-state.functions";
import { logClientWarn } from "@/lib/gafcore-client-logger";
import {
  completeGafcoreWorkflowTask,
  getGafcoreWorkflowStatus,
  planAndStartGafcoreWorkflow,
  syncGafcorePipelineWorkflow,
} from "@/lib/gafcore-workflow.functions";

export type OrchestrationWorkflowUi = {
  tasks: WorkflowTaskUi[];
  planSummary: string | null;
  state: string | null;
  metrics: WorkflowMetricsUi | null;
};

type UseGafcoreOrchestrationOptions = {
  projectId: string | null | undefined;
  multiAgentMode: boolean;
  factoryMode: boolean;
  visualEditOn: boolean;
  lastError: string | null;
  pipelineRunIdRef: MutableRefObject<string | null>;
  activeProjectIdRef: MutableRefObject<string | null>;
  /** Sincroniza snapshot de workflow con el panel (compartido con multiagente en ChatPanel). */
  applyWorkflowUi: (patch: OrchestrationWorkflowUi) => void;
  clearWorkflowUi: () => void;
};

export function useGafcoreOrchestration({
  projectId,
  multiAgentMode,
  factoryMode,
  visualEditOn,
  lastError,
  pipelineRunIdRef,
  activeProjectIdRef,
  applyWorkflowUi,
  clearWorkflowUi,
}: UseGafcoreOrchestrationOptions) {
  const [workflowRunId, setWorkflowRunId] = useState<string | null>(null);
  const [orchestrationState, setOrchestrationState] =
    useState<ProjectOrchestrationState | null>(null);
  const [workflowUi, setWorkflowUi] = useState<OrchestrationWorkflowUi>({
    tasks: [],
    planSummary: null,
    state: null,
    metrics: null,
  });

  const activeTaskIdRef = useRef<string | null>(null);

  const callPlanAndStartWorkflow = useServerFn(planAndStartGafcoreWorkflow);
  const callGetWorkflowStatus = useServerFn(getGafcoreWorkflowStatus);
  const callCompleteWorkflowTask = useServerFn(completeGafcoreWorkflowTask);
  const callGetOrchestrationState = useServerFn(getProjectOrchestrationState);
  const callSyncOrchestrationState = useServerFn(syncProjectOrchestrationState);
  const callVerifyDeploymentStep = useServerFn(verifyProjectDeploymentStep);
  const callSyncPipelineWorkflow = useServerFn(syncGafcorePipelineWorkflow);

  const patchWorkflowUi = useCallback(
    (patch: Partial<OrchestrationWorkflowUi>) => {
      setWorkflowUi((prev) => {
        const next = { ...prev, ...patch };
        applyWorkflowUi(next);
        return next;
      });
    },
    [applyWorkflowUi],
  );

  const syncWorkflowToPipeline = useCallback(
    async (runId: string, workflowState: string, planSummary: string) => {
      const pipelineRunId = pipelineRunIdRef.current;
      if (!pipelineRunId) return;
      try {
        await callSyncPipelineWorkflow({
          data: { pipelineRunId, workflowRunId: runId, workflowState, planSummary },
        });
      } catch {
        /* pipeline opcional */
      }
    },
    [callSyncPipelineWorkflow, pipelineRunIdRef],
  );

  const refresh = useCallback(
    async (runId?: string | null) => {
      const id = runId ?? workflowRunId;
      if (!id) return;
      const pid = projectId ?? activeProjectIdRef.current;
      try {
        const snap = await callGetWorkflowStatus({ data: { workflowRunId: id } });
        if (!snap.ok) {
          clearOrchestrationRunId(projectId);
          setWorkflowRunId(null);
          setOrchestrationState(null);
          setWorkflowUi({ tasks: [], planSummary: null, state: null, metrics: null });
          if (!multiAgentMode) clearWorkflowUi();
          return;
        }
        setWorkflowRunId(id);
        const uiPatch: OrchestrationWorkflowUi = {
          tasks: snap.tasks as WorkflowTaskUi[],
          planSummary: snap.planSummary ?? null,
          state: snap.run.state,
          metrics: snap.metrics ? (snap.metrics as WorkflowMetricsUi) : null,
        };
        patchWorkflowUi(uiPatch);
        if (pid) {
          const st = await callGetOrchestrationState({
            data: { projectId: pid, workflowRunId: id },
          });
          if (st.ok && st.state) setOrchestrationState(st.state);
        }
      } catch (e) {
        logClientWarn("orchestration-workflow-refresh", e);
      }
    },
    [
      workflowRunId,
      projectId,
      activeProjectIdRef,
      callGetWorkflowStatus,
      callGetOrchestrationState,
      multiAgentMode,
      clearWorkflowUi,
      patchWorkflowUi,
    ],
  );

  const syncPreviewState = useCallback(
    async (previewOk: boolean, previewError: string | null) => {
      const runId = workflowRunId;
      const pid = projectId ?? activeProjectIdRef.current;
      if (!runId || !pid) return;
      try {
        const res = await callSyncOrchestrationState({
          data: {
            projectId: pid,
            workflowRunId: runId,
            preview: { ok: previewOk, lastError: previewError },
          },
        });
        if (res.ok && res.state) setOrchestrationState(res.state);
      } catch (e) {
        logClientWarn("orchestration-state-sync", e);
      }
    },
    [workflowRunId, projectId, activeProjectIdRef, callSyncOrchestrationState],
  );

  const planWorkflow = useCallback(
    async (instruction: string, pid: string, contextFiles: FileItem[]) => {
      if (factoryMode || multiAgentMode || visualEditOn) return null;
      try {
        const res = await callPlanAndStartWorkflow({
          data: {
            projectId: pid,
            instruction,
            files: contextFiles.map((f) => ({
              name: f.name,
              content: f.content,
              language: f.language,
            })),
            pipelineRunId: pipelineRunIdRef.current ?? undefined,
          },
        });
        if (!res.ok) {
          if (res.error === "workflow_limit_reached") {
            toast.message("Límite de workflows activos. Puedes seguir construyendo manualmente.", {
              duration: 6000,
            });
          }
          return null;
        }
        persistOrchestrationRunId(pid, res.workflowRunId);
        setWorkflowRunId(res.workflowRunId);
        await refresh(res.workflowRunId);
        if (res.planSummary) {
          patchWorkflowUi({ planSummary: res.planSummary });
        }
        if (pipelineRunIdRef.current) {
          await syncWorkflowToPipeline(res.workflowRunId, "executing", res.planSummary ?? "");
        }
        return res.workflowRunId;
      } catch (e) {
        logClientWarn("orchestration-workflow-plan", e);
        return null;
      }
    },
    [
      factoryMode,
      multiAgentMode,
      visualEditOn,
      callPlanAndStartWorkflow,
      pipelineRunIdRef,
      refresh,
      patchWorkflowUi,
      syncWorkflowToPipeline,
    ],
  );

  const assignActiveTaskBeforeBuild = useCallback(
    (effectiveBuild: boolean) => {
      if (workflowRunId && workflowUi.tasks.length > 0 && effectiveBuild) {
        activeTaskIdRef.current = pickCurrentOrchestrationTask(workflowUi.tasks)?.id ?? null;
      } else {
        activeTaskIdRef.current = null;
      }
    },
    [workflowRunId, workflowUi.tasks],
  );

  const completeTaskAfterBuild = useCallback(
    async (params: {
      effectiveBuild: boolean;
      hasBlockingValidation: boolean;
      generationValidationBlocked: boolean;
      previewError: string | null;
    }) => {
      const {
        effectiveBuild,
        hasBlockingValidation,
        generationValidationBlocked,
        previewError,
      } = params;
      const runId = workflowRunId;
      const taskId = activeTaskIdRef.current;
      if (
        !effectiveBuild ||
        !runId ||
        !taskId ||
        hasBlockingValidation ||
        generationValidationBlocked
      ) {
        return;
      }

      const activeTask = workflowUi.tasks.find((t) => t.id === taskId);
      const pid = activeProjectIdRef.current ?? projectId;
      let canComplete = true;

      if (activeTask?.agent_type === "deployment" && pid) {
        try {
          const verify = await callVerifyDeploymentStep({
            data: {
              projectId: pid,
              workflowRunId: runId,
              preview: {
                ok: !previewError?.trim(),
                lastError: previewError,
              },
            },
          });
          if (verify.ok && verify.state) {
            setOrchestrationState(verify.state);
          }
          if (!verify.ok || !verify.ready) {
            canComplete = false;
            toast.message(verify.message ?? "Paso de despliegue pendiente", {
              description: (verify.guidance ?? []).join(" · ") || undefined,
              duration: 10_000,
            });
          } else {
            toast.success("Deploy verificado: GitHub, Vercel y sitio OK", { duration: 6000 });
          }
        } catch (e) {
          logClientWarn("orchestration-deploy-verify", e);
        }
      }

      if (canComplete) {
        try {
          await callCompleteWorkflowTask({
            data: { taskId, outcome: "succeeded" },
          });
          await refresh(runId);
          await syncPreviewState(true, null);
        } catch (e) {
          logClientWarn("orchestration-task-complete", e);
        }
      }
      activeTaskIdRef.current = null;
    },
    [
      workflowRunId,
      workflowUi.tasks,
      projectId,
      activeProjectIdRef,
      callVerifyDeploymentStep,
      callCompleteWorkflowTask,
      refresh,
      syncPreviewState,
    ],
  );

  useEffect(() => {
    if (!projectId || multiAgentMode || factoryMode) return;
    const stored = readOrchestrationRunId(projectId);
    if (!stored) return;
    let cancelled = false;
    void (async () => {
      await refresh(stored);
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, multiAgentMode, factoryMode, refresh]);

  useEffect(() => {
    if (!workflowRunId || !projectId) return;
    const err = lastError?.trim() || null;
    void syncPreviewState(!err, err);
  }, [lastError, workflowRunId, projectId, syncPreviewState]);

  const nextSteps = useMemo(
    () =>
      buildOrchestrationNextSteps(
        workflowRunId,
        workflowUi.tasks,
        multiAgentMode,
        factoryMode,
      ),
    [workflowRunId, workflowUi.tasks, multiAgentMode, factoryMode],
  );

  const panelStatus = useMemo(
    () =>
      buildOrchestrationPanelStatus(
        workflowRunId,
        workflowUi.tasks,
        workflowUi.planSummary,
        orchestrationState,
      ),
    [workflowRunId, workflowUi.tasks, workflowUi.planSummary, orchestrationState],
  );

  const integrationStatusLine = useMemo(
    () => formatOrchestrationStatusLine(orchestrationState),
    [orchestrationState],
  );

  return {
    workflowRunId,
    orchestrationState,
    workflowUi,
    nextSteps,
    panelStatus,
    integrationStatusLine,
    refresh,
    syncPreviewState,
    planWorkflow,
    assignActiveTaskBeforeBuild,
    completeTaskAfterBuild,
    isActive: Boolean(workflowRunId),
  };
}
