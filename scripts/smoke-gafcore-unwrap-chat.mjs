#!/usr/bin/env node
/** Smoke: unwrap JSON embebido en reply (espejo de unwrapGafcoreChatPayload). */
const { parseJsonLoose } = await import("../src/lib/gafcore-json-loose.shared.ts");

function validateOutputFiles(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r) => r && typeof r.name === "string" && typeof r.content === "string");
}

function unwrapGafcoreChatPayload(reply, files) {
  let outReply = typeof reply === "string" ? reply : "";
  let outFiles = files;
  const tryExtract = (text) => {
    const trimmed = text.trim();
    if (!trimmed.startsWith("{") && !trimmed.includes('"files"')) return false;
    const parsed = parseJsonLoose(trimmed);
    if (!parsed) return false;
    let changed = false;
    if (typeof parsed.reply === "string" && parsed.reply.trim()) {
      outReply = parsed.reply;
      changed = true;
    }
    if (Array.isArray(parsed.files) && validateOutputFiles(parsed.files).length > 0) {
      outFiles = parsed.files;
      changed = true;
    }
    return changed;
  };
  if (validateOutputFiles(outFiles).length === 0) tryExtract(outReply);
  if (outReply.trim().startsWith("{") && /"files"\s*:/.test(outReply)) tryExtract(outReply);
  return { reply: outReply, files: outFiles };
}

const blob = JSON.stringify({
  reply: "• Archivos listos",
  files: [{ name: "App.tsx", content: "export default function App(){return null}" }],
});

const out = unwrapGafcoreChatPayload(blob, []);
if (out.reply !== "• Archivos listos" || validateOutputFiles(out.files).length !== 1) {
  console.error("FAIL unwrap from reply JSON", out);
  process.exit(1);
}

console.log("smoke-gafcore-unwrap-chat OK");
