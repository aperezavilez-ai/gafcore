/**
 * Métricas de runs Modo Fábrica (payload en gafcore_pipeline_runs).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPipelineRunForUser, updatePipelineRun } from "@/lib/gafcore-orchestrator.server";

export type FactoryPhaseMetric = {
  phase: string;
  ok: boolean;
  ms: number;
  detail?: string;
};

export type FactoryRunMetrics = {
  version: 1;
  startedAt: string;
  completedAt: string;
  success: boolean;
  factoryProfileId?: string;
  factoryProfileLabel?: string;
  validationScore?: number;
  buildSmokeOk?: boolean;
  deployOk?: boolean;
  deployHost?: string;
  phases: FactoryPhaseMetric[];
};

export async function recordFactoryRunMetrics(
  sb: SupabaseClient,
  pipelineRunId: string,
  userId: string,
  metrics: FactoryRunMetrics,
): Promise<void> {
  const run = await getPipelineRunForUser(sb, pipelineRunId, userId);
  if (!run) return;

  const payload =
    typeof run.payload_json === "object" && run.payload_json && !Array.isArray(run.payload_json)
      ? { ...run.payload_json }
      : {};

  await updatePipelineRun(sb, pipelineRunId, userId, {
    payload_json: {
      ...payload,
      factoryMetrics: metrics,
    },
  });
}

export class FactoryPhaseTimer {
  private readonly startedAt = Date.now();
  private readonly phases: FactoryPhaseMetric[] = [];

  mark(phase: string, ok: boolean, detail?: string): void {
    this.phases.push({
      phase,
      ok,
      ms: Date.now() - this.startedAt,
      detail,
    });
  }

  finish(success: boolean, extra?: Partial<FactoryRunMetrics>): FactoryRunMetrics {
    return {
      version: 1,
      startedAt: new Date(this.startedAt).toISOString(),
      completedAt: new Date().toISOString(),
      success,
      phases: this.phases,
      ...extra,
    };
  }
}
