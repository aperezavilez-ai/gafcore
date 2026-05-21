import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ProjFile } from "@/lib/gafcore-chat.shared";
import { generateTaskPlan } from "@/tasks/planner.server";
import { createWorkflowRun } from "@/tasks/workflow.server";
import { applyWorkflowPatches, loadWorkflowProjectFiles } from "@/tasks/workflow-files.server";
import { checkWorkflowStartLimit } from "@/tasks/workflow-limits.server";
import {
  claimReadyTasksForWorkflow,
  completeTask,
  appendTaskLog,
  pickTasksForParallelWave,
  releaseTaskToReady,
  getWorkflowMaxParallel,
} from "@/tasks/scheduler.server";
import {
  filterTasksByFileLocks,
  getActiveLocksForWorkflow,
  pathsFromPatches,
  setTaskFileLocks,
} from "@/tasks/file-locks.server";
import { executeAgentTask, persistTaskArtifact } from "@/tasks/executor.server";
import type { AgentTaskRow } from "@/tasks/types";
import type { FilePatch } from "@/tasks/artifacts.shared";

export async function planAndCreateWorkflow(
  projectId: string,
  userId: string,
  instruction: string,
  files: ProjFile[],
  pipelineRunId?: string,
): Promise<{ workflowRunId: string; planSummary: string; pipelineRunId?: string | null }> {
  const limit = await checkWorkflowStartLimit(userId);
  if (!limit.allowed) {
    const err = new Error("workflow_limit_reached");
    (err as Error & { code: string; active: number; max: number }).code = "workflow_limit_reached";
    (err as Error & { active: number; max: number }).active = limit.active;
    (err as Error & { max: number }).max = limit.max;
    throw err;
  }

  const plan = await generateTaskPlan(instruction, files);
  const { workflowRunId } = await createWorkflowRun(
    projectId,
    userId,
    instruction,
    plan,
    pipelineRunId,
    { files, planSummary: plan.summary },
  );
  return { workflowRunId, planSummary: plan.summary, pipelineRunId: pipelineRunId ?? null };
}

export async function syncWorkflowRunState(workflowRunId: string): Promise<string> {
  const { data: taskRows } = await supabaseAdmin
    .from("gafcore_agent_tasks")
    .select("state, agent_type")
    .eq("workflow_run_id", workflowRunId);

  const states = (taskRows ?? []).map((t) => t.state);
  if (states.length === 0) return "planning";

  let next = "executing";
  if (taskRows?.some((t) => t.state === "running" && t.agent_type === "validation")) {
    next = "validating";
  } else if (
    taskRows?.some((t) => t.state === "running" && ["frontend", "backend", "refactor"].includes(t.agent_type))
  ) {
    next = "executing";
  }
  if (states.every((s) => s === "succeeded" || s === "cancelled")) {
    next = "completed";
  } else if (states.some((s) => s === "failed")) {
    next = "failed";
  } else if (!states.some((s) => ["ready", "running", "blocked", "pending"].includes(s))) {
    next = "completed";
  }

  await supabaseAdmin
    .from("gafcore_workflow_runs")
    .update({ state: next, updated_at: new Date().toISOString() })
    .eq("id", workflowRunId);

  return next;
}

export type WorkflowStepResult = {
  done: boolean;
  workflowState: string;
  task: Pick<AgentTaskRow, "id" | "agent_type" | "title" | "state"> | null;
  reply?: string;
  patches: FilePatch[];
  error?: string;
};

async function loadWorkflowRun(workflowRunId: string, userId: string) {
  return supabaseAdmin
    .from("gafcore_workflow_runs")
    .select("instruction, state")
    .eq("id", workflowRunId)
    .eq("user_id", userId)
    .maybeSingle();
}

export async function executeClaimedTask(opts: {
  workflowRunId: string;
  task: AgentTaskRow;
  files: ProjFile[];
  workflowInstruction: string;
}): Promise<WorkflowStepResult> {
  const { workflowRunId, task, files, workflowInstruction } = opts;

  if (task.workflow_run_id !== workflowRunId) {
    await completeTask(task.id, "failed", { errorMessage: "workflow_mismatch" });
    return {
      done: false,
      workflowState: await syncWorkflowRunState(workflowRunId),
      task: { id: task.id, agent_type: task.agent_type, title: task.title, state: "failed" },
      patches: [],
      error: "wrong_workflow",
    };
  }

  try {
    const result = await executeAgentTask({ task, files, workflowInstruction });
    const artifactId = await persistTaskArtifact(workflowRunId, task.id, "file_patch_set", {
      version: 1,
      patches: result.patches,
      agentType: task.agent_type,
      reply: result.reply,
    });
    await completeTask(task.id, "succeeded", { artifactIds: artifactId ? [artifactId] : [] });
    await appendTaskLog(task.id, "executed", result.reply.slice(0, 200));
    if (result.patches.length > 0) {
      await applyWorkflowPatches(workflowRunId, result.patches);
      await setTaskFileLocks(task.id, pathsFromPatches(result.patches));
    }
    const workflowState = await syncWorkflowRunState(workflowRunId);
    return {
      done: workflowState === "completed" || workflowState === "failed",
      workflowState,
      task: { id: task.id, agent_type: task.agent_type, title: task.title, state: "succeeded" },
      reply: result.reply,
      patches: result.patches,
    };
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    await completeTask(task.id, "failed", { errorMessage: msg.slice(0, 500) });
    const workflowState = await syncWorkflowRunState(workflowRunId);
    return {
      done: workflowState === "failed",
      workflowState,
      task: { id: task.id, agent_type: task.agent_type, title: task.title, state: "failed" },
      patches: [],
      error: msg,
    };
  }
}

/** Un paso (legacy): una tarea. */
export async function runWorkflowStep(opts: {
  workflowRunId: string;
  projectId: string;
  userId: string;
  files: ProjFile[];
}): Promise<WorkflowStepResult> {
  const { workflowRunId, userId, files } = opts;
  const { data: run } = await loadWorkflowRun(workflowRunId, userId);
  if (!run) {
    return { done: true, workflowState: "failed", task: null, patches: [], error: "workflow_not_found" };
  }

  const claimed = await claimReadyTasksForWorkflow(workflowRunId, userId, 1);
  const task = claimed[0];
  if (!task) {
    const workflowState = await syncWorkflowRunState(workflowRunId);
    return {
      done: workflowState === "completed" || workflowState === "failed",
      workflowState,
      task: null,
      patches: [],
    };
  }

  return executeClaimedTask({
    workflowRunId,
    task,
    files,
    workflowInstruction: run.instruction,
  });
}

/** B1: una ola — hasta N tareas en paralelo (1 escritor). */
export async function runWorkflowParallelWave(opts: {
  workflowRunId: string;
  projectId: string;
  userId: string;
  files: ProjFile[];
  maxParallel?: number;
}): Promise<{
  steps: WorkflowStepResult[];
  claimed: number;
  done: boolean;
  workflowState: string;
}> {
  const { workflowRunId, userId } = opts;
  const maxParallel = opts.maxParallel ?? getWorkflowMaxParallel();
  let files = opts.files;
  if (!files.length) {
    files = await loadWorkflowProjectFiles(workflowRunId);
  }

  const { data: run } = await loadWorkflowRun(workflowRunId, userId);
  if (!run) {
    return {
      steps: [],
      claimed: 0,
      done: true,
      workflowState: "failed",
    };
  }

  const claimed = await claimReadyTasksForWorkflow(workflowRunId, userId, maxParallel);
  if (claimed.length === 0) {
    const workflowState = await syncWorkflowRunState(workflowRunId);
    return {
      steps: [],
      claimed: 0,
      done: workflowState === "completed" || workflowState === "failed",
      workflowState,
    };
  }

  const activeLocks = await getActiveLocksForWorkflow(workflowRunId);
  const { toRun: lockFiltered, deferred: lockDeferred } = filterTasksByFileLocks(
    claimed,
    activeLocks,
  );
  for (const t of lockDeferred) {
    await releaseTaskToReady(t.id);
    await appendTaskLog(t.id, "deferred", "Path bloqueado por otra tarea", "info");
  }

  const { toRun, deferredWriters } = pickTasksForParallelWave(lockFiltered);
  for (const w of deferredWriters) {
    await releaseTaskToReady(w.id);
    await appendTaskLog(w.id, "deferred", "Escritor en cola (1 por ola)", "info");
  }

  const steps = await Promise.all(
    toRun.map((task) =>
      executeClaimedTask({
        workflowRunId,
        task,
        files,
        workflowInstruction: run.instruction,
      }),
    ),
  );

  const workflowState = await syncWorkflowRunState(workflowRunId);
  const done = workflowState === "completed" || workflowState === "failed";

  return { steps, claimed: toRun.length, done, workflowState };
}

/** B1: olas paralelas hasta completar o maxSteps tareas. */
export async function runWorkflowBatch(opts: {
  workflowRunId: string;
  projectId: string;
  userId: string;
  files: ProjFile[];
  maxSteps?: number;
  maxParallel?: number;
}): Promise<{
  steps: WorkflowStepResult[];
  mergedPatches: FilePatch[];
  workflowState: string;
  waves: number;
}> {
  const maxSteps = Math.min(opts.maxSteps ?? 12, 24);
  const steps: WorkflowStepResult[] = [];
  const patchMap = new Map<string, FilePatch>();
  let waves = 0;
  let tasksRun = 0;

  while (tasksRun < maxSteps) {
    const snapFiles = await loadWorkflowProjectFiles(opts.workflowRunId);
    const waveFiles = snapFiles.length > 0 ? snapFiles : opts.files;
    const wave = await runWorkflowParallelWave({
      ...opts,
      files: waveFiles,
      maxParallel: opts.maxParallel,
    });
    waves += 1;
    steps.push(...wave.steps);
    for (const s of wave.steps) {
      tasksRun += 1;
      for (const p of s.patches) {
        patchMap.set(p.name, p);
      }
    }
    if (wave.done) break;
    if (wave.claimed === 0) break;
  }

  const workflowState = await syncWorkflowRunState(opts.workflowRunId);
  const mergedFromDb = await loadWorkflowProjectFiles(opts.workflowRunId);
  const patchList = [...patchMap.values()];
  if (mergedFromDb.length > 0) {
    return {
      steps,
      mergedPatches: mergedFromDb.map((f) => ({
        name: f.name,
        content: f.content,
        language: f.language,
      })),
      workflowState,
      waves,
    };
  }
  return {
    steps,
    mergedPatches: patchList,
    workflowState,
    waves,
  };
}
