/**
 * Smoke: normalización y heurísticas del historial de versiones.
 * Ejecutar: node scripts/smoke-gafcore-snapshot-restore.mjs
 */
import assert from "node:assert/strict";
import {
  normalizeSnapshotFiles,
  isRiskySnapshotLabel,
  snapshotLikelyHasSyntaxError,
} from "../src/lib/gafcore-snapshot-restore.shared.ts";

const files = normalizeSnapshotFiles([
  { name: "App.tsx", language: "typescript", content: "export default () => <div />" },
]);
assert.equal(files?.length, 1);
assert.equal(files[0].name, "App.tsx");

const fromMap = normalizeSnapshotFiles({
  "App.tsx": { name: "App.tsx", content: "x", language: "typescript" },
});
assert.equal(fromMap?.length, 1);

assert.equal(isRiskySnapshotLabel("auto-fix: SyntaxError"), true);
assert.equal(isRiskySnapshotLabel("bueno antes login"), false);

assert.equal(
  snapshotLikelyHasSyntaxError([
    { name: "App.tsx", language: "typescript", content: "const x = ((((" },
  ]),
  true,
);

console.log("smoke-gafcore-snapshot-restore: OK");
