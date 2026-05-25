#!/usr/bin/env node
/**
 * Smoke local del brand wizard (schema + presets + context block + detector).
 *
 *   npm run gafcore:smoke-brand-wizard
 */
const { brandSchema, brandPresets, buildBrandFromInput, brandContextBlock, isFreshBuildInstruction } =
  await import("../src/lib/gafcore-brand.shared.ts");

let fail = 0;
function expect(label, cond) {
  console.log(`${cond ? "OK  " : "FAIL"} ${label}`);
  if (!cond) fail += 1;
}

console.log("\n=== Brand wizard — schema + presets ===\n");

const sectors = Object.keys(brandPresets);
expect(`Hay 13 presets (encontrados ${sectors.length})`, sectors.length === 13);

for (const sector of sectors) {
  const built = buildBrandFromInput({
    name: `Test ${sector}`,
    sector,
    mood: ["test"],
  });
  const valid = brandSchema.safeParse(built);
  expect(`preset ${sector.padEnd(22)} valida`, valid.success);
}

console.log("\n=== Bloque de contexto inyectable ===");
const brand = buildBrandFromInput({
  name: "StockFlow",
  sector: "saas-b2b",
  mood: ["confiable", "moderno", "claro"],
  tagline: "Inventario sin complicaciones",
});
const block = brandContextBlock(brand);
expect("incluye nombre marca", block.includes("StockFlow"));
expect("incluye tagline", block.includes("Inventario sin"));
expect("incluye paleta oklch", block.includes("oklch"));
expect("incluye --primary", block.includes("--primary"));
expect("incluye tipografía display", block.includes(brand.typography.display));
expect("incluye radius", block.includes(brand.shape.radius));

console.log("\n=== Detector wizard ===");
const positives = [
  "Crea una landing para mi SaaS",
  "Construye una tienda online",
  "Haz una página web para mi restaurante",
  "Genera un dashboard de admin",
  "Diseña un portfolio creativo",
];
const negatives = [
  "Cambia el color del botón",
  "Añade un loading spinner",
  "Hola",
  "Refactoriza este componente",
];
for (const p of positives) {
  expect(`positivo: "${p.slice(0, 40)}"`, isFreshBuildInstruction(p));
}
for (const n of negatives) {
  expect(`negativo: "${n.slice(0, 40)}"`, !isFreshBuildInstruction(n));
}

console.log(`\n${fail === 0 ? "[smoke-brand-wizard] OK" : `[smoke-brand-wizard] FAIL (${fail})`}`);
process.exit(fail === 0 ? 0 : 1);
