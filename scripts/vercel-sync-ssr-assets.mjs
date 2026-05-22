/**
 * Vercel/Linux: el manifest SSR puede referenciar /assets/* con hash distinto al de static/.
 * Reescribe TODAS las rutas a archivos que existen en .vercel/output/static/assets.
 */
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(process.cwd());
const outDir = join(root, ".vercel", "output");
const staticAssets = join(outDir, "static", "assets");
const serverFunc = join(outDir, "functions", "__server.func");

if (!existsSync(staticAssets) || !existsSync(serverFunc)) {
  console.log("[vercel-sync-ssr-assets] skip: no .vercel/output");
  process.exit(0);
}

const staticFiles = readdirSync(staticAssets);
const staticSet = new Set(staticFiles);

const mainCss =
  staticFiles
    .filter((f) => f.endsWith(".css"))
    .map((name) => ({ name, size: statSync(join(staticAssets, name)).size }))
    .sort((a, b) => b.size - a.size)[0]?.name ?? null;

const mainIndexJs =
  staticFiles
    .filter((f) => f.startsWith("index-") && f.endsWith(".js"))
    .map((name) => ({ name, size: statSync(join(staticAssets, name)).size }))
    .sort((a, b) => b.size - a.size)[0]?.name ?? null;

const gafcoreCss = staticFiles.find((f) => f === "gafcore-app.css") ?? mainCss;

/** index-Ab12Cd.js → resuelve al fichero real en static/ */
function resolveAssetHref(href) {
  const file = href.replace(/^\/assets\//, "");
  if (staticSet.has(file)) return href;

  const dot = file.lastIndexOf(".");
  if (dot < 0) return href;
  const ext = file.slice(dot + 1);
  const baseWithHash = file.slice(0, dot);
  const dash = baseWithHash.indexOf("-");
  const prefix = dash > 0 ? baseWithHash.slice(0, dash) : baseWithHash;

  if (ext === "css") {
    if (gafcoreCss) return `/assets/${gafcoreCss}`;
    if (mainCss) return `/assets/${mainCss}`;
  }

  const candidates = staticFiles.filter((f) => f.startsWith(`${prefix}-`) && f.endsWith(`.${ext}`));
  if (candidates.length === 1) return `/assets/${candidates[0]}`;
  if (prefix === "index" && ext === "js" && mainIndexJs) return `/assets/${mainIndexJs}`;

  return href;
}

const assetPattern = /\/assets\/[a-zA-Z0-9_.-]+\.(?:css|js|mjs|woff2?|png|svg)/g;

function walk(dir, files = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p, files);
    else if (/\.(mjs|js|json)$/.test(ent.name)) files.push(p);
  }
  return files;
}

function patchAssetRefs(content) {
  assetPattern.lastIndex = 0;
  let localReplacements = 0;
  const next = content.replace(assetPattern, (match) => {
    const resolved = resolveAssetHref(match);
    if (resolved !== match) localReplacements++;
    return resolved;
  });
  return { next, localReplacements, changed: next !== content };
}

let filesPatched = 0;
let replacements = 0;

for (const file of walk(serverFunc)) {
  const src = readFileSync(file, "utf8");
  if (!assetPattern.test(src)) continue;
  assetPattern.lastIndex = 0;
  const { next, localReplacements, changed } = patchAssetRefs(src);
  if (changed) {
    writeFileSync(file, next, "utf8");
    filesPatched++;
    replacements += localReplacements;
  }
}

/** Comprueba referencias huérfanas tras el parche (solo manifest + index). */
function collectMissingAssets() {
  const missing = new Set();
  const manifestFiles = readdirSync(serverFunc).filter((n) => n.startsWith("_tanstack-start-manifest_"));
  for (const name of manifestFiles) {
    const src = readFileSync(join(serverFunc, name), "utf8");
    assetPattern.lastIndex = 0;
    for (const match of src.matchAll(assetPattern)) {
      const file = match[0].replace(/^\/assets\//, "");
      if (!staticSet.has(file)) missing.add(match[0]);
    }
  }
  return [...missing];
}

/** Si el SSR local responde 200, guarda el markup de <body> para hidratar en fallback. */
async function captureSpaBodyHtml() {
  const entry = join(serverFunc, "index.mjs");
  if (!existsSync(entry)) return undefined;
  try {
    const mod = await import(pathToFileURL(entry).href);
    const handler = mod.default ?? mod;
    if (typeof handler?.fetch !== "function") return undefined;
    const res = await handler.fetch(new Request("http://127.0.0.1/"), {}, {});
    if (res.status !== 200) return undefined;
    const html = await res.text();
    const match = html.match(/<body[^>]*>([\s\S]*?)<script/i);
    if (!match?.[1]) return undefined;
    return match[1].trim();
  } catch {
    return undefined;
  }
}

async function probeSsrHome() {
  const entry = join(serverFunc, "index.mjs");
  if (!existsSync(entry)) return { ok: false, reason: "no-entry" };
  try {
    const mod = await import(pathToFileURL(entry).href);
    const handler = mod.default ?? mod;
    const res = await handler.fetch(new Request("http://127.0.0.1/"), {}, {});
    return { ok: res.status < 500, status: res.status };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

let bodyCaptured = false;
let ssrProbe = { ok: false };

if (mainCss && mainIndexJs) {
  const bodyHtml = await captureSpaBodyHtml();
  bodyCaptured = Boolean(bodyHtml);
  const shellPath = join(serverFunc, "gafcore-spa-shell.json");
  const cssHref = gafcoreCss ? `/assets/${gafcoreCss}` : `/assets/${mainCss}`;
  const payload = {
    css: cssHref,
    js: `/assets/${mainIndexJs}`,
    ...(bodyHtml ? { bodyHtml } : {}),
  };
  writeFileSync(shellPath, JSON.stringify(payload), "utf8");
}

const publicDir = join(root, "public");
const staticRoot = join(outDir, "static");
const publicIcons = [
  "favicon.svg",
  "favicon.png",
  "favicon-32.png",
  "apple-touch-icon.png",
  "og-image.png",
];
let publicCopied = 0;
for (const name of publicIcons) {
  const src = join(publicDir, name);
  if (!existsSync(src)) continue;
  copyFileSync(src, join(serverFunc, name));
  publicCopied++;
  if (existsSync(staticRoot)) {
    copyFileSync(src, join(staticRoot, name));
  }
}

const missingAfter = collectMissingAssets();
ssrProbe = await probeSsrHome();

console.log(
  `[vercel-sync-ssr-assets] css=${gafcoreCss ?? mainCss ?? "none"} js=${mainIndexJs ?? "none"} body=${bodyCaptured ? "captured" : "default"} public=${publicCopied} ssrProbe=${ssrProbe.ok ? "ok" : JSON.stringify(ssrProbe)} missing=${missingAfter.length} → ${filesPatched} files, ${replacements} fixes`,
);
if (missingAfter.length > 0) {
  console.warn("[vercel-sync-ssr-assets] orphan assets:", missingAfter.slice(0, 8).join(", "));
}
