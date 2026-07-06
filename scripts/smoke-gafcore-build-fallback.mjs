#!/usr/bin/env node
/**
 * Smoke: build fallback must turn a plan-only/invalid AI result into compilable files.
 */
import { readFileSync } from "node:fs";
import { finalizeGafcoreBuildDelivery } from "../src/lib/gafcore-chat-delivery.shared.ts";
import { repairCommonJsxSyntaxErrors } from "../src/lib/gafcore-media.shared.ts";
import { validateGafcoreProjectCore } from "../src/lib/gafcore-validate.server.ts";
import { createWelcomeProjectFiles } from "../src/lib/gafcore-welcome-preview.shared.ts";

const contextFiles = createWelcomeProjectFiles();
const result = finalizeGafcoreBuildDelivery(
  "crea una landing page para una barberia",
  contextFiles,
  "Plan: hero, servicios y reserva.",
  [],
);

if (result.files.length === 0) {
  throw new Error("fallback did not produce files");
}

const app = result.files.find((file) => /^app\.tsx$/i.test(file.name));
if (!app) {
  throw new Error("fallback did not produce App.tsx");
}

if (!/Barberia Premium|Reserva tu cita|Servicios destacados/.test(app.content)) {
  throw new Error("fallback App.tsx does not match barberia request");
}

const badCloser = repairCommonJsxSyntaxErrors(`export default function App() {
  return (
    <main>
      <form></form>
    </main>
  );
}
</HTMLFormElement>;
`);

if (badCloser.includes("</HTMLFormElement>")) {
  throw new Error("bad HTMLFormElement closer survived repair");
}

const validation = await validateGafcoreProjectCore(
  result.files.map((file) => ({ name: file.name, content: file.content })),
);

if (!validation.ok) {
  throw new Error(
    "fallback files did not compile: " +
      validation.issues.map((issue) => `${issue.file}: ${issue.message}`).join(" | "),
  );
}

const chatPanel = readFileSync("src/components/ide/ChatPanel.tsx", "utf8");

if (!chatPanel.includes("createDeterministicBuildFallbackFiles")) {
  throw new Error("ChatPanel is not wired to the deterministic build fallback");
}

if (
  !chatPanel.includes("filesToApply.length === 0") ||
  !chatPanel.includes("Aplicando build seguro porque la IA no entrego archivos validos")
) {
  throw new Error("ChatPanel does not fallback when the AI delivers zero files");
}

if (
  !chatPanel.includes("applyBlocked &&") ||
  !chatPanel.includes("El build de la IA fallo; aplicando build seguro de respaldo")
) {
  throw new Error("ChatPanel does not retry with fallback when generated files fail to apply");
}

if (
  !chatPanel.includes("La IA fallo temporalmente; aplicando build seguro de respaldo") ||
  !chatPanel.includes("fallback-error:")
) {
  throw new Error("ChatPanel does not fallback when the AI request fails before returning files");
}

console.log("[smoke-build-fallback] OK");
