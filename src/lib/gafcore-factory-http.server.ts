/**
 * POST /api/gafcore/factory/run — flujo fábrica completo.
 * POST /api/gafcore/factory/status — estado pipeline + workflow.
 */
import { z } from "zod";
import { requireGafcoreApiUser } from "@/lib/gafcore-api-auth.server";
import { assertGafcoreProjectAccess } from "@/lib/gafcore-project-access.server";
import { enforceGafcoreRateLimit, GAFCORE_CHAT_IDE_LIMIT } from "@/lib/gafcore-api-ratelimit.server";
import { shouldUseFactoryAsyncRun } from "@/lib/gafcore-factory-async.server";
import { executeGafcoreFactoryRun } from "@/lib/gafcore-factory-run.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getPipelineRunForUser } from "@/lib/gafcore-orchestrator.server";
import { getWorkflowSnapshot } from "@/tasks/workflow.server";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

const fileSchema = z.object({
  name: z.string().min(1).max(512),
  language: z.string().max(64).optional(),
  content: z.string().max(500_000),
});

const runBodySchema = z.object({
  projectId: z.string().uuid(),
  projectName: z.string().min(1).max(200).optional(),
  instruction: z.string().min(1).max(8000),
  files: z.array(fileSchema).max(80),
  factoryProfileId: z.string().min(1).max(32).optional(),
  runDesignCritique: z.boolean().optional(),
  autoDeploy: z.boolean().optional(),
  asyncRun: z.boolean().optional(),
});

const statusBodySchema = z.object({
  pipelineRunId: z.string().uuid().optional(),
  workflowRunId: z.string().uuid().optional(),
});

export async function handleGafcoreFactoryRunPost(request: Request): Promise<Response> {
  const userId = await requireGafcoreApiUser(request);
  if (userId instanceof Response) return userId;

  const limited = await enforceGafcoreRateLimit(userId, {
    ...GAFCORE_CHAT_IDE_LIMIT,
    bucket: "gafcore_factory_run",
    max: 8,
  });
  if (limited) return limited;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = runBodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse(
      { ok: false, error: "invalid_body", detail: parsed.error.issues.slice(0, 4) },
      400,
    );
  }

  const access = await assertGafcoreProjectAccess(parsed.data.projectId, userId);
  if (!access.ok) return access.response;

  const result = await executeGafcoreFactoryRun({
    sb: supabaseAdmin,
    userId,
    projectId: parsed.data.projectId,
    projectName: parsed.data.projectName,
    instruction: parsed.data.instruction,
    files: parsed.data.files,
    factoryProfileId: parsed.data.factoryProfileId,
    runDesignCritique: parsed.data.runDesignCritique,
    autoDeploy: parsed.data.autoDeploy,
    asyncRun: parsed.data.asyncRun ?? shouldUseFactoryAsyncRun(),
  });

  if (result.ok && "async" in result && result.async) {
    return jsonResponse(result, 202);
  }

  return jsonResponse(result, result.ok ? 200 : 422);
}

export async function handleGafcoreFactoryStatusPost(request: Request): Promise<Response> {
  const userId = await requireGafcoreApiUser(request);
  if (userId instanceof Response) return userId;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  const parsed = statusBodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse({ ok: false, error: "invalid_body" }, 400);
  }

  let pipeline = null;
  let workflow = null;

  if (parsed.data.pipelineRunId) {
    pipeline = await getPipelineRunForUser(
      supabaseAdmin,
      parsed.data.pipelineRunId,
      userId,
    );
  }
  if (parsed.data.workflowRunId) {
    workflow = await getWorkflowSnapshot(parsed.data.workflowRunId, userId);
  }

  if (!pipeline && !workflow) {
    return jsonResponse({ ok: false, error: "not_found" }, 404);
  }

  return jsonResponse({
    ok: true,
    pipeline: pipeline
      ? {
          id: pipeline.id,
          state: pipeline.state,
          current_step: pipeline.current_step,
          events: pipeline.events_json,
        }
      : null,
    workflow: workflow
      ? {
          run: workflow.run,
          tasks: workflow.tasks,
          planSummary: workflow.planSummary,
        }
      : null,
  });
}
