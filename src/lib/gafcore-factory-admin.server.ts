/**
 * Agregación de métricas Modo Fábrica para panel admin.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { FactoryRunMetrics } from "@/lib/gafcore-factory-metrics.server";

export type FactoryRunListItem = {
  pipelineRunId: string;
  projectId: string;
  userId: string;
  state: string;
  createdAt: string;
  metrics: FactoryRunMetrics;
};

export type FactoryPhaseAggregate = {
  phase: string;
  total: number;
  ok: number;
  ratePct: number;
};

export type FactoryAdminDashboard = {
  totalRuns: number;
  successRuns: number;
  successRatePct: number;
  avgValidationScore: number | null;
  buildSmokeOkRatePct: number | null;
  deployAttempted: number;
  deployOkRatePct: number | null;
  phaseAggregates: FactoryPhaseAggregate[];
  recentRuns: FactoryRunListItem[];
};

function isFactoryMetrics(v: unknown): v is FactoryRunMetrics {
  if (!v || typeof v !== "object") return false;
  const m = v as FactoryRunMetrics;
  return m.version === 1 && Array.isArray(m.phases);
}

export async function loadFactoryAdminDashboard(limit = 40): Promise<FactoryAdminDashboard> {
  const { data, error } = await supabaseAdmin
    .from("gafcore_pipeline_runs")
    .select("id, project_id, user_id, state, created_at, payload_json")
    .order("created_at", { ascending: false })
    .limit(Math.min(limit * 5, 200));

  if (error) {
    console.error("[factory-admin] load:", error);
    return emptyDashboard();
  }

  const recentRuns: FactoryRunListItem[] = [];
  for (const row of data ?? []) {
    const payload = row.payload_json as Record<string, unknown> | null;
    const raw = payload?.factoryMetrics;
    if (!isFactoryMetrics(raw)) continue;
    recentRuns.push({
      pipelineRunId: row.id as string,
      projectId: row.project_id as string,
      userId: row.user_id as string,
      state: row.state as string,
      createdAt: row.created_at as string,
      metrics: raw,
    });
    if (recentRuns.length >= limit) break;
  }

  const phaseMap = new Map<string, { ok: number; total: number }>();
  let successRuns = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  let buildOk = 0;
  let buildTotal = 0;
  let deployAttempted = 0;
  let deployOk = 0;

  for (const run of recentRuns) {
    if (run.metrics.success) successRuns += 1;
    if (typeof run.metrics.validationScore === "number") {
      scoreSum += run.metrics.validationScore;
      scoreCount += 1;
    }
    if (run.metrics.buildSmokeOk !== undefined) {
      buildTotal += 1;
      if (run.metrics.buildSmokeOk) buildOk += 1;
    }
    if (run.metrics.deployOk !== undefined) {
      deployAttempted += 1;
      if (run.metrics.deployOk) deployOk += 1;
    }
    for (const p of run.metrics.phases) {
      const cur = phaseMap.get(p.phase) ?? { ok: 0, total: 0 };
      cur.total += 1;
      if (p.ok) cur.ok += 1;
      phaseMap.set(p.phase, cur);
    }
  }

  const totalRuns = recentRuns.length;
  const phaseAggregates: FactoryPhaseAggregate[] = [...phaseMap.entries()]
    .map(([phase, { ok, total }]) => ({
      phase,
      total,
      ok,
      ratePct: total > 0 ? Math.round((ok / total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    totalRuns,
    successRuns,
    successRatePct: totalRuns > 0 ? Math.round((successRuns / totalRuns) * 100) : 0,
    avgValidationScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null,
    buildSmokeOkRatePct: buildTotal > 0 ? Math.round((buildOk / buildTotal) * 100) : null,
    deployAttempted,
    deployOkRatePct: deployAttempted > 0 ? Math.round((deployOk / deployAttempted) * 100) : null,
    phaseAggregates,
    recentRuns,
  };
}

function emptyDashboard(): FactoryAdminDashboard {
  return {
    totalRuns: 0,
    successRuns: 0,
    successRatePct: 0,
    avgValidationScore: null,
    buildSmokeOkRatePct: null,
    deployAttempted: 0,
    deployOkRatePct: null,
    phaseAggregates: [],
    recentRuns: [],
  };
}
