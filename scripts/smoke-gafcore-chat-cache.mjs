#!/usr/bin/env node
/** Smoke: huella de caché y reglas de escritura (lógica espejo de gafcore-chat.shared). */

function djb2(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return h >>> 0;
}

function projectCacheFingerprint(files) {
  const parts = files.map((f) => `${f.name}:${f.content.length}:${djb2(f.content)}`);
  parts.sort();
  return parts.join(">");
}

function buildGafcoreChatCacheKey(input) {
  const projectPart = input.projectId?.trim() ? input.projectId.trim() : "_";
  const brandPart = input.brandName?.trim() ?? "";
  const instr = `${djb2(input.instruction).toString(16)}_${djb2(input.instruction.slice(Math.max(0, input.instruction.length - 4000))).toString(16)}`;
  return `${input.userId}:${input.model}:${instr}:${projectCacheFingerprint(input.files)}:${projectPart}:${brandPart}`;
}

function shouldWriteGafcoreChatCache(files, options) {
  if (options?.validationBlocked) return false;
  return files.length > 0;
}

const baseFiles = [{ name: "App.tsx", content: "export default function App(){ return null }" }];
const fp1 = projectCacheFingerprint(baseFiles);
const fp2 = projectCacheFingerprint([
  { name: "App.tsx", content: "export default function App(){ return null } // tail change" },
]);
if (fp1 === fp2) {
  console.error("FAIL: fingerprint should change when file content changes");
  process.exit(1);
}

const keyA = buildGafcoreChatCacheKey({
  userId: "u1",
  model: "m1",
  instruction: "haz un botón azul",
  files: baseFiles,
  projectId: "proj-a",
});
const keyB = buildGafcoreChatCacheKey({
  userId: "u1",
  model: "m1",
  instruction: "haz un botón azul",
  files: baseFiles,
  projectId: "proj-b",
});
if (keyA === keyB) {
  console.error("FAIL: cache keys must differ by projectId");
  process.exit(1);
}

if (shouldWriteGafcoreChatCache([], { validationBlocked: true })) {
  console.error("FAIL: should not write cache when validation blocked");
  process.exit(1);
}

console.log("smoke-gafcore-chat-cache OK");
