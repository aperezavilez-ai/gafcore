/**
 * CSV de runs Modo Fábrica (admin / export).
 */
import type { FactoryRunListItem } from "@/lib/gafcore-factory-admin.server";

function csvCell(value: string | number | boolean | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildFactoryRunsCsv(runs: FactoryRunListItem[]): string {
  const header = [
    "pipeline_run_id",
    "project_id",
    "user_id",
    "state",
    "created_at",
    "profile_id",
    "profile_label",
    "success",
    "validation_score",
    "build_smoke_ok",
    "deploy_ok",
    "deploy_host",
    "phases",
  ];
  const rows = runs.map((r) => {
    const phases = r.metrics.phases
      .map((p) => `${p.phase}:${p.ok ? "ok" : "fail"}(${p.ms}ms)`)
      .join(" | ");
    return [
      r.pipelineRunId,
      r.projectId,
      r.userId,
      r.state,
      r.createdAt,
      r.profileId,
      r.profileLabel,
      r.metrics.success,
      r.metrics.validationScore ?? "",
      r.metrics.buildSmokeOk ?? "",
      r.metrics.deployOk ?? "",
      r.metrics.deployHost ?? "",
      phases,
    ]
      .map(csvCell)
      .join(",");
  });
  return [header.join(","), ...rows].join("\n");
}
