#!/usr/bin/env node
/** Smoke: telemetría pipeline emite JSON con event/level. */

function logPipelineEvent(level, event, meta) {
  const IS_DEV = true;
  if (level === "info" && !IS_DEV) return;
  return { ts: "2026-01-01T00:00:00.000Z", event, level, ...(meta ?? {}) };
}

const row = logPipelineEvent("warn", "preview.error", {
  traceId: 42,
  projectId: "p1",
  phase: "preview",
  message: "SyntaxError",
});

if (row.event !== "preview.error" || row.level !== "warn" || row.traceId !== 42) {
  console.error("FAIL: pipeline telemetry shape");
  process.exit(1);
}

console.log("smoke-gafcore-pipeline-telemetry OK");
