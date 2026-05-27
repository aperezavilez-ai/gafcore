/**
 * Ejecución en segundo plano del Modo Fábrica (Vercel waitUntil).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPipelineRunForUser, updatePipelineRun } from "@/lib/gafcore-orchestrator.server";
import type { FactoryRunResult } from "@/lib/gafcore-factory.shared";

export function scheduleFactoryBackground(task: () => Promise<void>): void {
  void (async () => {
    try {
      const { waitUntil } = await import("@vercel/functions");
      waitUntil(task());
      return;
    } catch {
      /* local / sin @vercel/functions */
    }
    void task().catch((e) => {
      console.error("[factory-async] background task failed:", e);
    });
  })();
}

export async function persistFactoryAsyncResult(
  sb: SupabaseClient,
  pipelineRunId: string,
  userId: string,
  result: FactoryRunResult,
): Promise<void> {
  const run = await getPipelineRunForUser(sb, pipelineRunId, userId);
  if (!run) return;

  const base =
    typeof run.payload_json === "object" && run.payload_json && !Array.isArray(run.payload_json)
      ? { ...(run.payload_json as Record<string, unknown>) }
      : {};

  await updatePipelineRun(sb, pipelineRunId, userId, {
    payload_json: {
      ...base,
      factoryAsyncResult: result,
      factoryAsyncCompletedAt: new Date().toISOString(),
    },
  });
}

export function shouldUseFactoryAsyncRun(): boolean {
  return process.env.VERCEL === "1" || process.env.GAFCORE_FACTORY_ASYNC === "1";
}
