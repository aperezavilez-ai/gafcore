/**
 * Convierte gafcore-logo (JPEG disfrazado de PNG) a PNG RGBA con fondo negro → transparente.
 */
import sharp from "sharp";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE =
  process.argv[2] ||
  path.join(
    ROOT,
    "assets",
    "c__Users_apere_AppData_Roaming_Cursor_User_workspaceStorage_e9c2a3211436e6962e745c4e05c74a22_images_logo_gafcore__2_-0d478dd4-ae7c-47dd-9bdc-d1d88a58df85.png",
  );

const TARGETS = [
  path.join(ROOT, "src/assets/gafcore-logo.png"),
  path.join(ROOT, "public/gafcore-logo.png"),
];

/** Umbral: píxeles casi negros del fondo → alpha 0. Conserva texto blanco y colores del icono. */
function makeBlackTransparent(data, width, height, threshold = 28) {
  let transparent = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r <= threshold && g <= threshold && b <= threshold) {
        data[i + 3] = 0;
        transparent++;
      }
    }
  }
  return transparent;
}

async function buildTransparentPng(inputPath, outputPath) {
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const buf = Buffer.from(data);
  const removed = makeBlackTransparent(buf, info.width, info.height);

  await sharp(buf, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outputPath);

  const head = fs.readFileSync(outputPath).slice(0, 4).toString("hex");
  console.log(
    `✓ ${path.relative(ROOT, outputPath)} — ${info.width}x${info.height} RGBA, ${removed} px transparentes, sig=${head}`,
  );
}

if (!fs.existsSync(SOURCE)) {
  console.error("No se encontró el archivo fuente:", SOURCE);
  process.exit(1);
}

const srcHead = fs.readFileSync(SOURCE).slice(0, 4).toString("hex");
console.log(`Fuente: ${SOURCE}`);
console.log(`Formato real: ${srcHead.startsWith("89504e47") ? "PNG" : srcHead.startsWith("ffd8ff") ? "JPEG (mal nombrado)" : srcHead}`);

for (const out of TARGETS) {
  await buildTransparentPng(SOURCE, out);
}

console.log("Listo — usa src/assets y public/gafcore-logo.png (PNG transparente).");
