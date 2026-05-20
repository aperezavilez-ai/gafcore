import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { taskPlanSchema } from "@/tasks/artifacts.shared";
import { claimNextReadyTask, completeTask } from "@/tasks/scheduler.server";
import { createWorkflowRun, getWorkflowSnapshot } from "@/tasks/workflow.server";

const startSchema = z.object({
  projectId: z.string().uuid(),
  instruction: z.string().min(1).max(8000),
  plan: taskPlanSchema.optional(),
  pipelineRunId: z.string().uuid().optional(),
});

/** Inicia un workflow multiagente (con plan opcional). */
export const startGafcoreWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => startSchema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId!;
    const { data: project } = await context.supabase!
      .from("projects")
      .select("id")
      .eq("id", data.projectId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!project) return { ok: false as const, error: "project_not_found" };

    try {
      const { workflowRunId, planArtifactId } = await createWorkflowRun(
        data.projectId,
        userId,
        data.instruction,
        data.plan,
        data.pipelineRunId,
      );
      return { ok: true as const, workflowRunId, planArtifactId };
    } catch (e) {
      console.error("[workflow] start:", e);
      return { ok: false as const, error: "workflow_start_failed" };
    }
  });

const snapshotSchema = z.object({ workflowRunId: z.string().uuid() });

export const getGafcoreWorkflowStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => snapshotSchema.parse(input))
  .handler(async ({ data, context }) => {
    const snap = await getWorkflowSnapshot(data.workflowRunId, context.userId!);
    if (!snap) return { ok: false as const, error: "not_found" };
    return { ok: true as const, ...snap };
  });

const claimSchema = z.object({ projectId: z.string().uuid() });

/** Worker/cron: reclama siguiente tarea (A2 conectará executor). */
export const claimGafcoreWorkflowTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => claimSchema.parse(input))
  .handler(async ({ data, context }) => {
    const task = await claimNextReadyTask(data.projectId, context.userId!);
    return { ok: true as const, task };
  });

const completeSchema = z.object({
  taskId: z.string().uuid(),
  outcome: z.enum(["succeeded", "failed"]),
  errorMessage: z.string().optional(),
});

export const completeGafcoreWorkflowTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => completeSchema.parse(input))
  .handler(async ({ data }) => {
    await completeTask(data.taskId, data.outcome, {
      errorMessage: data.errorMessage,
    });
    return { ok: true as const };
  });
