#!/usr/bin/env node
/**
 * Smoke Modo Fábrica: build smoke + tipos compartidos (sin llamar IA).
 *
 *   npm run gafcore:smoke-factory
 */
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const shared = await import(
    pathToFileURL(resolve(root, "src/lib/gafcore-factory.shared.ts")).href
  );
  const smoke = await import(
    pathToFileURL(resolve(root, "src/lib/gafcore-factory-build-smoke.server.ts")).href
  );
  const templates = await import(
    pathToFileURL(resolve(root, "src/lib/gafcore-factory-templates.shared.ts")).href
  );

  if (!shared.FACTORY_BUILD_PREFIX.includes("fábrica")) {
    throw new Error("FACTORY_BUILD_PREFIX missing");
  }
  if (!shared.GAFCORE_FACTORY_PHASES.includes("build_smoke")) {
    throw new Error("GAFCORE_FACTORY_PHASES missing build_smoke");
  }

  const okFiles = [
    {
      name: "App.tsx",
      content: `export default function App() { return <div className="p-4">Hola</div>; }`,
    },
    { name: "main.tsx", content: `import App from "./App"; export default App;` },
  ];
  const entry = smoke.projectHasEntryPoint(okFiles);
  if (!entry.hasEntry) throw new Error("entry detection failed on valid project");

  const badFiles = [{ name: "broken.tsx", content: "const x = <" }];
  const bad = await smoke.runFactoryBuildSmoke(badFiles);
  if (bad.ok) throw new Error("expected build smoke fail on syntax");

  const good = await smoke.runFactoryBuildSmoke(okFiles);
  if (!good.ok) throw new Error(`expected build smoke ok: ${good.message}`);

  const landing = templates.resolveFactoryTemplateProfile("crea una landing con hero y pricing");
  if (landing.id !== "landing") throw new Error("landing profile resolution failed");
  const dash = templates.resolveFactoryTemplateProfile("dashboard con tarjetas kpi");
  if (dash.id !== "dashboard") throw new Error("dashboard profile resolution failed");

  console.log("gafcore:smoke-factory OK");
  console.log("  entry:", entry.entryFiles.join(", "));
  console.log("  good:", good.message);
  console.log("  bad:", bad.message);
  console.log("  profile landing:", landing.label);
  console.log("  profile dashboard:", dash.label);
}

main().catch((e) => {
  console.error("gafcore:smoke-factory FAIL:", e.message || e);
  process.exit(1);
});
