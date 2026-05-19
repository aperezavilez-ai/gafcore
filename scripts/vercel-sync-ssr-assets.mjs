/**
 * Vercel/Linux: el bundle SSR a veces referencia /assets/*.css con hash distinto al de static/.
 * Reescribe esas rutas al CSS real en .vercel/output/static/assets (evita HTTPError 500 en SSR).
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.cwd());
const outDir = join(root, ".vercel", "output");
const staticAssets = join(outDir, "static", "assets");
const serverFunc = join(outDir, "functions", "__server.func");

if (!existsSync(staticAssets) || !existsSync(serverFunc)) {
  console.log("[vercel-sync-ssr-assets] skip: no .vercel/output (build local sin VERCEL)");
  process.exit(0);
}

const cssFiles = readdirSync(staticAssets).filter((f) => f.endsWith(".css"));
if (cssFiles.length === 0) {
  console.warn("[vercel-sync-ssr-assets] no CSS in static/assets");
  process.exit(0);
}

// Hoja de estilos principal del app (la más grande suele ser Tailwind global).
const mainCss =
  cssFiles
    .map((name) => ({ name, size: statSync(join(staticAssets, name)).size }))
    .sort((a, b) => b.size - a.size)[0]?.name ?? cssFiles[0];

const canonicalHref = `/assets/${mainCss}`;
const cssPattern = /\/assets\/[a-zA-Z0-9_.-]+\.css/g;

function walk(dir, files = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (ent.name.endsWith(".mjs") || ent.name.endsWith(".js")) files.push(p);
  }
  return files;
}

let filesPatched = 0;
let replacements = 0;

for (const file of walk(serverFunc)) {
  const src = readFileSync(file, "utf8");
  if (!src.match(cssPattern)) continue;
  cssPattern.lastIndex = 0;
  const next = src.replace(cssPattern, (match) => {
    if (match === canonicalHref) return match;
    replacements++;
    return canonicalHref;
  });
  if (next !== src) {
    writeFileSync(file, next, "utf8");
    filesPatched++;
  }
}

console.log(
  `[vercel-sync-ssr-assets] canonical ${canonicalHref} → ${filesPatched} files, ${replacements} replacements`,
);
