#!/usr/bin/env node
/**
 * Smoke local del auditor de diseño: heurísticas estáticas + schema.
 *
 *   npm run gafcore:smoke-critique
 */
const { runStaticHeuristics, designCritiqueResponseSchema, buildCritiqueSystemPrompt, buildCritiqueUserMessage } =
  await import("../src/lib/gafcore-design-critique.shared.ts");

let fail = 0;
function expect(label, cond) {
  console.log(`${cond ? "OK  " : "FAIL"} ${label}`);
  if (!cond) fail += 1;
}

console.log("\n=== Heurísticas estáticas ===\n");

const badFiles = [
  {
    name: "App.tsx",
    content: `export default function App() {
  return (
    <div className="bg-blue-500 text-white p-6">
      <h1 className="text-red-600">Hola</h1>
      <button className="bg-green-500 text-white px-3 py-2" onClick={() => {}}>Click</button>
      <a href="#" className="text-purple-500">Link</a>
      <img src="https://picsum.photos/200" />
      <form>
        <input type="text" placeholder="Email" />
        <input type="password" placeholder="Pwd" />
        <input type="text" placeholder="Otro" />
      </form>
      <p className="bg-yellow-500 bg-pink-300 text-orange-700 border-red-400 text-emerald-200 bg-slate-50 text-zinc-900">x</p>
    </div>
  );
}`,
  },
];

const issues = runStaticHeuristics(badFiles);
console.log(`Issues detectados: ${issues.length}`);
for (const i of issues) console.log(`  - [${i.severity}] ${i.category} → ${i.title}`);

expect("detecta hardcoded colors", issues.some((i) => i.id.startsWith("hardcoded-colors")));
expect("detecta img sin alt", issues.some((i) => i.id.startsWith("img-no-alt")));
expect("detecta inputs sin label", issues.some((i) => i.id.startsWith("inputs-no-label")));
expect("detecta onClick vacío", issues.some((i) => i.id.startsWith("empty-onclick")));
expect("detecta href=#", issues.some((i) => i.id.startsWith("dead-href")));

console.log("\n=== Código limpio (sin issues) ===\n");
const cleanFiles = [
  {
    name: "App.tsx",
    content: `export default function App() {
  return (
    <main className="bg-background text-foreground p-6">
      <h1 className="text-3xl font-semibold">Bienvenido</h1>
      <p className="text-muted-foreground">Texto.</p>
    </main>
  );
}`,
  },
];
const cleanIssues = runStaticHeuristics(cleanFiles);
expect(`código limpio sin issues (${cleanIssues.length} detectados)`, cleanIssues.length === 0);

console.log("\n=== Schema de respuesta ===");
const validCritique = {
  summary: "Test",
  score: 80,
  issues: [
    {
      id: "test",
      category: "color",
      severity: "warning",
      title: "Test",
      detail: "x",
      suggestion: "y",
    },
  ],
  followupInstruction: "[modo profundo] Aplica fix.",
};
expect("schema valida critique correcta", designCritiqueResponseSchema.safeParse(validCritique).success);
expect(
  "schema rechaza severity inválida",
  !designCritiqueResponseSchema.safeParse({ ...validCritique, issues: [{ ...validCritique.issues[0], severity: "kk" }] }).success,
);

console.log("\n=== Prompt builder ===");
const sys = buildCritiqueSystemPrompt();
expect("system prompt menciona JSON", sys.includes("JSON"));
expect("system prompt menciona followupInstruction", sys.includes("followupInstruction"));

const user = buildCritiqueUserMessage({
  files: badFiles,
  staticIssues: issues,
  brandName: "StockFlow",
  brief: "Landing SaaS",
});
expect("user msg incluye nombre de marca", user.includes("StockFlow"));
expect("user msg incluye issues pre-detectados", user.includes("Issues pre-detectados"));

console.log(`\n${fail === 0 ? "[smoke-critique] OK" : `[smoke-critique] FAIL (${fail})`}`);
process.exit(fail === 0 ? 0 : 1);
