import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { executeGafcoreFactoryRun } from "@/lib/gafcore-factory-run.server";
import { getPipelineRunForUser } from "@/lib/gafcore-orchestrator.server";
import { getWorkflowSnapshot } from "@/tasks/workflow.server";

const fileSchema = z.object({
  name: z.string(),
  language: z.string().optional(),
  content: z.string(),
});

const runSchema = z.object({
  projectId: z.string().uuid(),
  projectName: z.string().min(1).max(200).optional(),
  instruction: z.string().min(1).max(8000),
  files: z.array(fileSchema).max(80),
  factoryProfileId: z.string().min(1).max(32).optional(),
  runDesignCritique: z.boolean().optional(),
  autoDeploy: z.boolean().optional(),
});

/** Ejecuta el flujo completo Modo Fábrica (plan → workflow → validación → crítica). */
export const runGafcoreFactory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => runSchema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId!;
    const sb = context.supabase!;

    const result = await executeGafcoreFactoryRun({
      sb,
      userId,
      projectId: data.projectId,
      projectName: data.projectName,
      instruction: data.instruction,
      files: data.files,
      factoryProfileId: data.factoryProfileId,
      runDesignCritique: data.runDesignCritique,
      autoDeploy: data.autoDeploy,
    });

    return result;
  });

const statusSchema = z.object({
  pipelineRunId: z.string().uuid().optional(),
  workflowRunId: z.string().uuid().optional(),
});

/** Estado de un run de fábrica (pipeline + workflow). */
export const getGafcoreFactoryStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => statusSchema.parse(input))
  .handler(async ({ data, context }) => {
    const userId = context.userId!;
    const sb = context.supabase!;

    let pipeline: Awaited<ReturnType<typeof getPipelineRunForUser>> = null;
    let workflow: Awaited<ReturnType<typeof getWorkflowSnapshot>> = null;

    if (data.pipelineRunId) {
      pipeline = await getPipelineRunForUser(sb, data.pipelineRunId, userId);
    }
    if (data.workflowRunId) {
      workflow = await getWorkflowSnapshot(data.workflowRunId, userId);
    }

    if (!pipeline && !workflow) {
      return { ok: false as const, error: "not_found" as const };
    }

    return {
      ok: true as const,
      pipeline: pipeline
        ? {
            id: pipeline.id,
            state: pipeline.state,
            current_step: pipeline.current_step,
            events: pipeline.events_json,
            factoryMetrics:
              typeof pipeline.payload_json === "object" &&
              pipeline.payload_json &&
              !Array.isArray(pipeline.payload_json)
                ? (pipeline.payload_json as Record<string, unknown>).factoryMetrics
                : undefined,
          }
        : null,
      workflow: workflow
        ? {
            run: workflow.run,
            tasks: workflow.tasks,
            planSummary: workflow.planSummary,
            metrics: workflow.metrics,
          }
        : null,
    };
  });
