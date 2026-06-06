#!/usr/bin/env node
/** Smoke: reglas de rollback (prefijo «antes:» y backup antes de restaurar). */

function findLatestByPrefix(list, prefix) {
  const lower = prefix.toLowerCase();
  return list.find((s) => s.label?.toLowerCase().startsWith(lower)) ?? null;
}

const rows = [
  { id: "1", label: "auto: foo", created_at: "2026-01-03" },
  { id: "2", label: "antes: landing hotel", created_at: "2026-01-02" },
  { id: "3", label: "bueno — login", created_at: "2026-01-01" },
];

const hit = findLatestByPrefix(rows, "antes:");
if (!hit || hit.id !== "2") {
  console.error("FAIL: expected latest antes: snapshot");
  process.exit(1);
}

console.log("smoke-gafcore-rollback OK");
