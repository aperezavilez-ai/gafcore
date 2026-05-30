#!/usr/bin/env node
/**
 * Smoke: 3 deltas simulados — merge incremental + sanación pre-preview.
 *   npm run gafcore:smoke-incremental
 */
import {
  applyIncrementalEditPersistence,
  auditJsxTagBalance,
  createCodeSnapshot,
  mergeIncrementalDelta,
  prepareIncrementalEditSession,
  restoreImportsInFile,
  validateAndHealBeforePreview,
} from "../src/lib/gafcore-incremental-edit.shared.ts";
import {
  auditSyntaxClosure,
  runIntegrityShield,
} from "../src/lib/gafcore-integrity-shield.shared.ts";

const baseline = [
  {
    name: "App.tsx",
    content: `import { useState } from "react";
import { Sparkles, Star } from "lucide-react";
import { Hero } from "./components/Hero";

export default function App() {
  const [q, setQ] = useState("");
  return (
    <main className="min-h-screen bg-background p-8">
      <Hero query={q} onQuery={setQ} />
      <section className="mt-6 flex gap-2">
        <Star className="size-5 text-primary" />
        <Sparkles className="size-5" />
      </section>
    </main>
  );
}`,
  },
  {
    name: "components/Hero.tsx",
    content: `export function Hero({ query, onQuery }: { query: string; onQuery: (v: string) => void }) {
  return (
    <header className="rounded-2xl border p-6">
      <h1 className="text-2xl font-bold">Viajes</h1>
      <input value={query} onChange={(e) => onQuery(e.target.value)} className="mt-4 w-full rounded-lg border px-3 py-2" />
    </header>
  );
}`,
  },
  {
    name: "main.tsx",
    content: `import { createRoot } from "react-dom/client";
import App from "./App";
createRoot(document.getElementById("root")!).render(<App />);`,
  },
];

let files = baseline.map((f) => ({ ...f }));

// Delta 1: cambio de color (OK)
const d1 = [
  {
    name: "App.tsx",
    content: files[0].content.replace("bg-background", "bg-muted"),
  },
];
files = mergeIncrementalDelta(files, d1);
if (!files[0].content.includes("bg-muted")) throw new Error("delta1: color no aplicado");

// Delta 2: App roto — falta import lucide y cierra mal Hero (simula 3er turno IA)
const brokenApp = `import { useState } from "react";
import { Hero } from "./components/Hero";

export default function App() {
  const [q, setQ] = useState("");
  return (
    <main className="min-h-screen bg-muted p-8">
      <Hero query={q} onQuery={setQ} />
      <section className="mt-6 flex gap-2">
        <Star className="size-5 text-primary" />
        <Sparkles className="size-5" />
      </section>
    </main>
  );
}`;
const d2 = [{ name: "App.tsx", content: brokenApp }];
const session = prepareIncrementalEditSession(files, "cambia el botón a naranja");
const { files: after2, heal: heal2 } = applyIncrementalEditPersistence(files, d2, session);
files = after2;

if (auditJsxTagBalance(files.find((f) => f.name === "App.tsx").content) !== 0) {
  throw new Error("delta2: tags JSX aún desbalanceados");
}
const app2 = files.find((f) => f.name === "App.tsx").content;
if (!app2.includes("lucide-react") || !app2.includes("Sparkles")) {
  throw new Error("delta2: imports lucide no restaurados");
}
if (!files.some((f) => f.name === "components/Hero.tsx")) {
  throw new Error("delta2: Hero.tsx eliminado");
}

// Delta 3: intento borrar Hero — debe restaurarse
const d3 = [{ name: "components/Hero.tsx", content: "" }];
const snap = createCodeSnapshot(files);
const heal3 = validateAndHealBeforePreview(files, mergeIncrementalDelta(files, d3.filter((f) => f.content)), snap);
if (!heal3.files.some((f) => f.name === "components/Hero.tsx" && f.content.includes("export function Hero"))) {
  throw new Error("delta3: Hero no restaurado tras borrado");
}

const restored = restoreImportsInFile(
  `export default function X(){ return <Sparkles className="h-4" />; }`,
  baseline[0].content,
);
if (!restored.includes("lucide-react")) throw new Error("restoreImportsInFile falló");

// Escudo: sintaxis rota + edición hijo no debe destruir App
const badSyntax = `export default function App() { return (<main><Hero /></main>; }`;
const shieldSnap = createCodeSnapshot(files);
const shield = runIntegrityShield(files, [{ name: "App.tsx", content: badSyntax }], shieldSnap, {
  deltaPaths: ["App.tsx"],
  instruction: "cambia el color del botón en el componente Hero",
});
if (!auditSyntaxClosure(shield.files.find((f) => f.name === "App.tsx")?.content ?? "").ok) {
  throw new Error("escudo: sintaxis App no sanada");
}

console.log("[smoke-incremental] OK — 3 deltas + escudo de integridad");
if (heal2.healed) console.log("[smoke-incremental] sanación delta2:", heal2.notes.join("; "));
if (heal3.healed) console.log("[smoke-incremental] sanación delta3:", heal3.notes.join("; "));
