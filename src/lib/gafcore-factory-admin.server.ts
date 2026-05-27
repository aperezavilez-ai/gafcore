/**
 * Agregación de métricas Modo Fábrica para panel admin.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { FactoryRunMetrics } from "@/lib/gafcore-factory-metrics.server";
import {
  GAFCORE_FACTORY_ALERT_MIN_SAMPLES,
  GAFCORE_FACTORY_GLOBAL_ALERT_THRESHOLD,
  GAFCORE_FACTORY_PHASE_ALERT_THRESHOLD,
} from "@/lib/gafcore-factory.shared";

export type FactoryRunListItem = {
  pipelineRunId: string;
  projectId: string;
  userId: string;
  state: string;
  createdAt: string;
  profileId: string;
  profileLabel: string;
  metrics: FactoryRunMetrics;
};

export type FactoryPhaseAggregate = {
  phase: string;
  total: number;
  ok: number;
  ratePct: number;
};

export type FactoryPhaseAlert = {
  phase: string;
  ratePct: number;
  total: number;
  message: string;
};

export type FactoryProfileAggregate = {
  profileId: string;
  profileLabel: string;
  total: number;
  successRuns: number;
  successRatePct: number;
};

export type FactoryProfileTrendPoint = {
  day: string;
  total: number;
  successRuns: number;
  successRatePct: number;
};

export type FactoryProfileTrend = {
  profileId: string;
  profileLabel: string;
  points: FactoryProfileTrendPoint[];
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
  phaseAlerts: FactoryPhaseAlert[];
  globalAlert: string | null;
  profileFilter: string | null;
  profileBreakdown: FactoryProfileAggregate[];
  profileTrend7d: FactoryProfileTrend[];
  recentRuns: FactoryRunListItem[];
};

function resolveRunProfile(
  metrics: FactoryRunMetrics,
  payload: Record<string, unknown> | null,
): { profileId: string; profileLabel: string } {
  if (metrics.factoryProfileId) {
    return {
      profileId: metrics.factoryProfileId,
      profileLabel: metrics.factoryProfileLabel ?? metrics.factoryProfileId,
    };
  }
  const id =
    typeof payload?.factoryProfileId === "string" ? payload.factoryProfileId : "unknown";
  const label =
    typeof payload?.factoryProfileLabel === "string"
      ? payload.factoryProfileLabel
      : id;
  return { profileId: id, profileLabel: label };
}

function isFactoryMetrics(v: unknown): v is FactoryRunMetrics {
  if (!v || typeof v !== "object") return false;
  const m = v as FactoryRunMetrics;
  return m.version === 1 && Array.isArray(m.phases);
}

export async function loadFactoryAdminDashboard(
  limit = 40,
  profileFilter?: string | null,
): Promise<FactoryAdminDashboard> {
  const activeFilter =
    profileFilter && profileFilter !== "all" && profileFilter.length > 0
      ? profileFilter
      : null;
  const { data, error } = await supabaseAdmin
    .from("gafcore_pipeline_runs")
    .select("id, project_id, user_id, state, created_at, payload_json")
    .order("created_at", { ascending: false })
    .limit(Math.min(limit * 5, 200));

  if (error) {
    console.error("[factory-admin] load:", error);
    return emptyDashboard(activeFilter);
  }

  const allRuns: FactoryRunListItem[] = [];
  for (const row of data ?? []) {
    const payload = row.payload_json as Record<string, unknown> | null;
    const raw = payload?.factoryMetrics;
    if (!isFactoryMetrics(raw)) continue;
    const { profileId, profileLabel } = resolveRunProfile(raw, payload);
    allRuns.push({
      pipelineRunId: row.id as string,
      projectId: row.project_id as string,
      userId: row.user_id as string,
      state: row.state as string,
      createdAt: row.created_at as string,
      profileId,
      profileLabel,
      metrics: raw,
    });
  }

  const profileMap = new Map<string, FactoryProfileAggregate>();
  for (const run of allRuns) {
    const cur = profileMap.get(run.profileId) ?? {
      profileId: run.profileId,
      profileLabel: run.profileLabel,
      total: 0,
      successRuns: 0,
      successRatePct: 0,
    };
    cur.total += 1;
    if (run.metrics.success) cur.successRuns += 1;
    profileMap.set(run.profileId, cur);
  }
  const profileBreakdown: FactoryProfileAggregate[] = [...profileMap.values()]
    .map((p) => ({
      ...p,
      successRatePct: p.total > 0 ? Math.round((p.successRuns / p.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const dayBuckets: string[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    dayBuckets.push(d.toISOString().slice(0, 10));
  }
  const trendMap = new Map<
    string,
    {
      profileId: string;
      profileLabel: string;
      points: Map<string, { total: number; successRuns: number }>;
    }
  >();
  for (const run of allRuns) {
    const day = run.createdAt.slice(0, 10);
    if (!dayBuckets.includes(day)) continue;
    const cur = trendMap.get(run.profileId) ?? {
      profileId: run.profileId,
      profileLabel: run.profileLabel,
      points: new Map<string, { total: number; successRuns: number }>(),
    };
    const point = cur.points.get(day) ?? { total: 0, successRuns: 0 };
    point.total += 1;
    if (run.metrics.success) point.successRuns += 1;
    cur.points.set(day, point);
    trendMap.set(run.profileId, cur);
  }
  const profileTrend7d: FactoryProfileTrend[] = [...trendMap.values()]
    .map((profile) => ({
      profileId: profile.profileId,
      profileLabel: profile.profileLabel,
      points: dayBuckets.map((day) => {
        const p = profile.points.get(day) ?? { total: 0, successRuns: 0 };
        return {
          day,
          total: p.total,
          successRuns: p.successRuns,
          successRatePct: p.total > 0 ? Math.round((p.successRuns / p.total) * 100) : 0,
        };
      }),
    }))
    .sort((a, b) => {
      const at = a.points.reduce((acc, p) => acc + p.total, 0);
      const bt = b.points.reduce((acc, p) => acc + p.total, 0);
      return bt - at;
    });

  const recentRuns = (
    activeFilter ? allRuns.filter((r) => r.profileId === activeFilter) : allRuns
  ).slice(0, limit);

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

  const successRatePct = totalRuns > 0 ? Math.round((successRuns / totalRuns) * 100) : 0;

  const phaseAlerts: FactoryPhaseAlert[] = phaseAggregates
    .filter((p) => p.total >= GAFCORE_FACTORY_ALERT_MIN_SAMPLES && p.ratePct < GAFCORE_FACTORY_PHASE_ALERT_THRESHOLD)
    .map((p) => ({
      phase: p.phase,
      ratePct: p.ratePct,
      total: p.total,
      message: `Fase «${p.phase}» solo ${p.ratePct}% OK (${p.ok}/${p.total} runs). Revisar cerebro, validación o deploy.`,
    }));

  const globalAlert =
    totalRuns >= GAFCORE_FACTORY_ALERT_MIN_SAMPLES &&
    successRatePct < GAFCORE_FACTORY_GLOBAL_ALERT_THRESHOLD
      ? `Éxito global de fábrica bajo: ${successRatePct}% en los últimos ${totalRuns} runs.`
      : null;

  return {
    totalRuns,
    successRuns,
    successRatePct,
    avgValidationScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null,
    buildSmokeOkRatePct: buildTotal > 0 ? Math.round((buildOk / buildTotal) * 100) : null,
    deployAttempted,
    deployOkRatePct: deployAttempted > 0 ? Math.round((deployOk / deployAttempted) * 100) : null,
    phaseAggregates,
    phaseAlerts,
    globalAlert,
    profileFilter: activeFilter,
    profileBreakdown,
    profileTrend7d,
    recentRuns,
  };
}

export async function loadFactoryRunsForExport(exportLimit = 200): Promise<FactoryRunListItem[]> {
  const { data, error } = await supabaseAdmin
    .from("gafcore_pipeline_runs")
    .select("id, project_id, user_id, state, created_at, payload_json")
    .order("created_at", { ascending: false })
    .limit(Math.min(exportLimit * 3, 500));

  if (error) {
    console.error("[factory-admin] export load:", error);
    return [];
  }

  const runs: FactoryRunListItem[] = [];
  for (const row of data ?? []) {
    const payload = row.payload_json as Record<string, unknown> | null;
    const raw = payload?.factoryMetrics;
    if (!isFactoryMetrics(raw)) continue;
    const { profileId, profileLabel } = resolveRunProfile(raw, payload);
    runs.push({
      pipelineRunId: row.id as string,
      projectId: row.project_id as string,
      userId: row.user_id as string,
      state: row.state as string,
      createdAt: row.created_at as string,
      profileId,
      profileLabel,
      metrics: raw,
    });
    if (runs.length >= exportLimit) break;
  }
  return runs;
}

function emptyDashboard(profileFilter: string | null = null): FactoryAdminDashboard {
  return {
    totalRuns: 0,
    successRuns: 0,
    successRatePct: 0,
    avgValidationScore: null,
    buildSmokeOkRatePct: null,
    deployAttempted: 0,
    deployOkRatePct: null,
    phaseAggregates: [],
    phaseAlerts: [],
    globalAlert: null,
    profileFilter,
    profileBreakdown: [],
    profileTrend7d: [],
    recentRuns: [],
  };
}
