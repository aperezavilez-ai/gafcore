#!/usr/bin/env node
/**
 * Smoke: build fallback must turn a plan-only/invalid AI result into compilable files.
 */
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

console.log("[smoke-build-fallback] OK");
