#!/usr/bin/env node
/** Smoke del parser JSON tolerante. */
const { parseJsonLoose } = await import("../src/lib/gafcore-json-loose.shared.ts");

let fail = 0;
function check(label, got, expected) {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  console.log(`${ok ? "OK  " : "FAIL"} ${label}${ok ? "" : ` — got=${JSON.stringify(got)} expected=${JSON.stringify(expected)}`}`);
  if (!ok) fail += 1;
}

check("JSON puro", parseJsonLoose('{"a":1}'), { a: 1 });
check("con fence ```json", parseJsonLoose('```json\n{"a":2}\n```'), { a: 2 });
check("con fence ```", parseJsonLoose('```\n{"a":3}\n```'), { a: 3 });
check("texto antes", parseJsonLoose('Aquí está: {"a":4}'), { a: 4 });
check("texto antes y después", parseJsonLoose('Listo!\n{"a":5}\nFin.'), { a: 5 });
check(
  "nested con strings que contienen llaves",
  parseJsonLoose('Reply: {"reply":"hola {mundo}","files":[]}'),
  { reply: "hola {mundo}", files: [] },
);
check("array suelto", parseJsonLoose("Pre [1,2,3] post"), [1, 2, 3]);
check("inválido devuelve null", parseJsonLoose("solo texto sin json"), null);
check("vacío devuelve null", parseJsonLoose(""), null);
check(
  "JSON con backticks dentro de strings",
  parseJsonLoose('{"reply":"usa `npm install`"}'),
  { reply: "usa `npm install`" },
);

console.log(`\n${fail === 0 ? "[smoke-json-loose] OK" : `[smoke-json-loose] FAIL (${fail})`}`);
process.exit(fail === 0 ? 0 : 1);
