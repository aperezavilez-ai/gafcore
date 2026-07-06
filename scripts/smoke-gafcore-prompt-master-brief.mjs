#!/usr/bin/env node
import {
  buildGafcorePromptMasterBrief,
  buildGafcorePromptMasterBriefAppend,
} from "../src/lib/gafcore-prompt-master-brief.shared.ts";
import { buildProfessionalAgentPromptAppend } from "../src/agents/registry.shared.ts";
import { gateDeliveredFiles } from "../src/lib/gafcore-chat-delivery-gate.shared.ts";

const shoeBrief = buildGafcorePromptMasterBrief("hazme una tienda premium de tenis rojos con efectos hover");
if (shoeBrief.projectType !== "ecommerce") throw new Error("tienda de tenis debe ser ecommerce");
if (shoeBrief.vertical !== "calzado") throw new Error("tenis debe detectar vertical calzado");
if (!shoeBrief.palette.includes("rojo")) throw new Error("debe extraer color rojo");
if (!shoeBrief.effects.some((effect) => /hover/i.test(effect))) throw new Error("debe extraer efectos hover");
if (!shoeBrief.requiredInteractions.some((item) => /carrito/i.test(item))) {
  throw new Error("ecommerce debe exigir carrito");
}

const dashboardBrief = buildGafcorePromptMasterBrief("crea un dashboard crm corporativo con metricas y tabla de clientes");
if (dashboardBrief.projectType !== "dashboard") throw new Error("dashboard crm debe ser dashboard");
if (!dashboardBrief.requiredSections.some((section) => /KPI/i.test(section))) {
  throw new Error("dashboard debe exigir KPIs");
}

const append = buildGafcorePromptMasterBriefAppend("crea una pagina web para una clinica dental");
for (const expected of ["GAFCORE PROMPT MASTER BRIEF", "Tipo de proyecto", "Vertical/industria", "Done when"]) {
  if (!append.includes(expected)) throw new Error(`brief append incompleto: ${expected}`);
}

const professionalPrompt = buildProfessionalAgentPromptAppend("crea una app operativa para agenda de citas");
if (!professionalPrompt.includes("GAFCORE PROMPT MASTER BRIEF")) {
  throw new Error("orquestador no incluye prompt master brief");
}
if (!professionalPrompt.includes("Interacciones funcionales obligatorias")) {
  throw new Error("orquestador no incluye interacciones obligatorias");
}

const deadDashboardFiles = [
  {
    name: "index.html",
    language: "html",
    content: '<div id="root"></div><script type="module" src="/main.tsx"></script>',
  },
  {
    name: "main.tsx",
    language: "typescript",
    content: 'import React from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App";\ncreateRoot(document.getElementById("root")!).render(<App />);\n',
  },
  {
    name: "App.tsx",
    language: "typescript",
    content: `export default function App() {
  return <main><h1>CRM Dashboard</h1><section><h2>Clientes</h2><p>Feature 1</p><p>Feature 2</p></section></main>;
}
`,
  },
];

const deadGate = await gateDeliveredFiles([], deadDashboardFiles, "crea un dashboard CRM operativo con tabla y filtros");
if (deadGate.ok) throw new Error("quality gate acepto dashboard sin interacciones reales");
if (!deadGate.issues.some((issue) => /genericos|interacciones reales|operativo/i.test(issue.message))) {
  throw new Error("quality gate no explico dashboard generico/sin interacciones");
}

const validLandingFiles = [
  {
    name: "index.html",
    language: "html",
    content: '<div id="root"></div><script type="module" src="/main.tsx"></script>',
  },
  {
    name: "main.tsx",
    language: "typescript",
    content: 'import React from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App";\ncreateRoot(document.getElementById("root")!).render(<App />);\n',
  },
  {
    name: "App.tsx",
    language: "typescript",
    content: `import React, { useState } from "react";
export default function App() {
  const [sent, setSent] = useState(false);
  return <main><section><h1>Clinica Dental Sonrisa Clara</h1><p>Atencion dental preventiva, ortodoncia y urgencias con especialistas certificados.</p><button type="button" onClick={() => setSent(true)}>Agendar consulta</button>{sent ? <p>Solicitud recibida</p> : null}</section><section><h2>Servicios dentales</h2><article>Limpieza avanzada</article><article>Ortodoncia invisible</article><article>Implantes</article></section></main>;
}
`,
  },
];

const landingGate = await gateDeliveredFiles([], validLandingFiles, "crea una pagina web para una clinica dental");
if (!landingGate.ok) {
  throw new Error("quality gate bloqueo landing valida: " + landingGate.issues.map((issue) => issue.message).join(" | "));
}

console.log("[smoke-prompt-master-brief] OK");
