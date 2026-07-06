#!/usr/bin/env node
import { selectProfessionalSkills, buildProfessionalAgentPromptAppend } from "../src/agents/registry.shared.ts";
import { gateDeliveredFiles } from "../src/lib/gafcore-chat-delivery-gate.shared.ts";
import { createDeterministicBuildFallbackFiles } from "../src/lib/gafcore-chat-delivery.shared.ts";
import { validateGafcoreProjectCore } from "../src/lib/gafcore-validate.server.ts";

const instruction = "hazme una pagina de venta de tenis";

const skills = selectProfessionalSkills(instruction).map((skill) => skill.id);
if (!skills.includes("ecommerce")) {
  throw new Error("tenis/calzado debe activar la skill ecommerce");
}

const prompt = buildProfessionalAgentPromptAppend(instruction);
for (const expected of ["tienda de tenis", "tallas", "Producto A", "picsum"]) {
  if (!prompt.toLowerCase().includes(expected.toLowerCase())) {
    throw new Error(`prompt profesional no incluye regla esperada: ${expected}`);
  }
}

const badFiles = [
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
  const products = [
    { name: "Tenis Modelo A", price: 1200, image: "https://picsum.photos/seed/mountain/600/400" },
    { name: "Tenis Modelo B", price: 1500, image: "https://picsum.photos/seed/waterfall/600/400" }
  ];
  return <main><h1>Catalogo de Tenis</h1>{products.map((p) => <article key={p.name}><img src={p.image} alt="paisaje" /><h2>{p.name}</h2><p>$ {p.price}</p></article>)}</main>;
}
`,
  },
];

const badGate = await gateDeliveredFiles([], badFiles, instruction);
if (badGate.ok) {
  throw new Error("quality gate acepto una tienda de tenis generica con picsum");
}
const badText = badGate.issues.map((issue) => issue.message).join("\n");
if (!/Producto A|Modelo A|picsum|imagenes/i.test(badText)) {
  throw new Error("quality gate no explico el problema de productos/imagenes genericas");
}

const fallbackFiles = createDeterministicBuildFallbackFiles(instruction);
const goodGate = await gateDeliveredFiles([], fallbackFiles, instruction);
if (!goodGate.ok) {
  throw new Error(
    "fallback de tenis no paso quality gate: " + goodGate.issues.map((issue) => issue.message).join(" | "),
  );
}

const build = await validateGafcoreProjectCore(
  goodGate.files.map((file) => ({ name: file.name, content: file.content })),
);
if (!build.ok) {
  throw new Error("fallback de tenis no compila: " + build.issues.map((issue) => issue.message).join(" | "));
}

console.log("[smoke-quality-gate] OK");
