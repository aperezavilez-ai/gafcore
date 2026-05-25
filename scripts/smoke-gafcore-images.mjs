#!/usr/bin/env node
/**
 * Smoke local del router de imágenes — valida detección de intención y selección de modelo.
 *
 *   npm run gafcore:smoke-images
 */
const { planImage, detectImageIntent, pickImageModel } = await import(
  "../src/lib/gafcore-image-router.shared.ts"
);

const cases = [
  { instruction: "logo de StockFlow vector minimalista", expected: { intent: "logo", model: "recraft-v3-svg" } },
  { instruction: "imagen hero principal de la landing", expected: { intent: "hero", model: "flux-1.1-pro-ultra" } },
  { instruction: "banner promocional con texto Black Friday 50%", expected: { intent: "banner_text", model: "ideogram-v3-turbo" } },
  { instruction: "foto del producto zapatillas blancas", expected: { intent: "product", model: "flux-1.1-pro-ultra" } },
  { instruction: "icono de carrito", expected: { intent: "icon", model: "recraft-v3" } },
  { instruction: "avatar de usuario John Doe", expected: { intent: "avatar", model: "flux-1.1-pro-ultra" } },
  { instruction: "fondo abstracto para sección", expected: { intent: "background", model: "flux-schnell" } },
  { instruction: "ilustración isométrica de equipo trabajando", expected: { intent: "illustration", model: "recraft-v3" } },
  { instruction: "una imagen bonita", expected: { intent: "generic", model: "flux-schnell" } },
];

let fail = 0;
console.log("\n=== Router de imágenes GafCore ===\n");
for (const c of cases) {
  const plan = planImage({ instruction: c.instruction });
  const okIntent = plan.intent === c.expected.intent;
  const okModel = plan.model === c.expected.model;
  const ok = okIntent && okModel;
  if (!ok) fail += 1;
  console.log(
    `${ok ? "OK " : "FAIL"} ${c.instruction.slice(0, 50).padEnd(50)} → intent=${plan.intent.padEnd(13)} model=${plan.model.padEnd(20)} aspect=${plan.aspectRatio}`,
  );
}

console.log(`\n${fail === 0 ? "[smoke-images] OK" : `[smoke-images] FAIL (${fail})`}`);
process.exit(fail === 0 ? 0 : 1);
