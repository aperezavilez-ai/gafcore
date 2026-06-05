#!/usr/bin/env node
/** Smoke de validateOutputFiles (schema IA → archivos). */
const { validateOutputFiles } = await import("../src/lib/gafcore-output-files-validate.shared.ts");

let fail = 0;
function check(label, got, expected) {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  console.log(
    `${ok ? "OK  " : "FAIL"} ${label}${ok ? "" : ` — got=${JSON.stringify(got)} expected=${JSON.stringify(expected)}`}`,
  );
  if (!ok) fail += 1;
}

check(
  "name + content",
  validateOutputFiles([{ name: "App.tsx", content: "export default function App(){ return null }" }]),
  [{ name: "App.tsx", content: "export default function App(){ return null }" }],
);

check(
  "path alias (común en LLM)",
  validateOutputFiles([{ path: "App.tsx", content: "export default function App(){ return <h1>OK</h1> }" }]),
  [{ name: "App.tsx", content: "export default function App(){ return <h1>OK</h1> }" }],
);

check(
  "filename alias",
  validateOutputFiles([{ filename: "main.tsx", content: "import App from './App'" }]),
  [{ name: "main.tsx", content: "import App from './App'" }],
);

check(
  "rechaza content vacío",
  validateOutputFiles([{ name: "App.tsx", content: "   " }]),
  [],
);

check(
  "rechaza sin nombre",
  validateOutputFiles([{ content: "x" }]),
  [],
);

check(
  "dedupe por nombre (último gana)",
  validateOutputFiles([
    { name: "App.tsx", content: "v1" },
    { path: "App.tsx", content: "v2" },
  ]),
  [{ name: "App.tsx", content: "v2" }],
);

check(
  "no array devuelve vacío",
  validateOutputFiles({ name: "App.tsx", content: "x" }),
  [],
);

console.log(`\n${fail === 0 ? "[smoke-validate-output] OK" : `[smoke-validate-output] FAIL (${fail})`}`);
process.exit(fail === 0 ? 0 : 1);
