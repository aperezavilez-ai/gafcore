#!/usr/bin/env node
/** Smoke: no revertir App IA cuando reemplaza plantilla de bienvenida. */
const {
  isGafcoreDefaultTemplateApp,
  isReplacingWelcomeApp,
} = await import("../src/lib/gafcore-project-stale.shared.ts");

const welcome = `export default function App(){ return <div>Bienvenidos a GafCore — Empieza escribiendo en el chat</div> }`;
const aiApp = `export default function App(){ return <h1>TEST OK</h1> }`;

let fail = 0;
function check(label, ok) {
  console.log(`${ok ? "OK  " : "FAIL"} ${label}`);
  if (!ok) fail += 1;
}

check("detecta plantilla welcome", isGafcoreDefaultTemplateApp(welcome));
check("detecta App IA real", !isGafcoreDefaultTemplateApp(aiApp));
check("isReplacingWelcomeApp true", isReplacingWelcomeApp(welcome, aiApp));
check("isReplacingWelcomeApp false si ya era real", !isReplacingWelcomeApp(aiApp, welcome));

console.log(`\n${fail === 0 ? "[smoke-welcome-replace] OK" : `[smoke-welcome-replace] FAIL (${fail})`}`);
process.exit(fail === 0 ? 0 : 1);
