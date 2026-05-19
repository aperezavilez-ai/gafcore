import type { ProjFile } from "@/lib/gafcore-chat.shared";

/** Mapa nombre de archivo → data URL o https para resolver rutas en preview. */
export function buildAssetUrlMap(files: ProjFile[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of files) {
    const c = f.content.trim();
    if (!c.startsWith("data:image/")) continue;
    const n = f.name.replace(/\\/g, "/");
    map[n] = c;
    const base = n.split("/").pop();
    if (base) map[base] = c;
    if (n.startsWith("assets/")) map[n.slice("assets/".length)] = c;
  }
  return map;
}

export function picsumFallbackUrl(seed: string, w = 1280, h = 720): string {
  const s = encodeURIComponent(
    seed.replace(/[^a-zA-Z0-9-_]+/g, "-").slice(0, 48) || "gafcore",
  );
  return `https://picsum.photos/seed/${s}/${w}/${h}`;
}

/** Semillas estables por tema (Picsum devuelve la misma foto por seed). */
const PAINTING_SEEDS = [
  "gafcore-paint-hero-kitchen",
  "gafcore-paint-product-1",
  "gafcore-paint-product-2",
  "gafcore-paint-product-3",
  "gafcore-paint-product-4",
  "gafcore-paint-product-5",
  "gafcore-paint-exterior",
  "gafcore-paint-interior",
];

export function themedPicsumUrl(
  label: string,
  instruction: string,
  slot = 0,
  w = 800,
  h = 600,
): string {
  const ctx = `${instruction} ${label}`.toLowerCase();
  const paint =
    /pintura|coating|coatings|paint|barniz|fachada|interior|exterior|latex|primer|commercial|residential|premier/i.test(
      ctx,
    );
  if (paint) {
    const seed = PAINTING_SEEDS[slot % PAINTING_SEEDS.length];
    return picsumFallbackUrl(seed, w, h);
  }
  return picsumFallbackUrl(label || `slot-${slot}`, w, h);
}

/** Rutas locales o placeholders que el preview no puede cargar. */
export function isUnresolvableImageSrc(src: string): boolean {
  const s = src.trim();
  if (!s || s === "#") return true;
  if (s.startsWith("data:")) return false;
  if (s.startsWith("https://picsum.photos/")) return false;
  if (!s.startsWith("http")) return true;
  if (/^https?:\/\/(?:www\.)?example\.com/i.test(s)) return true;
  if (
    /^https:\/\/images\.unsplash\.com\//i.test(s) &&
    !/photo-\d{6,}-[a-f0-9]{6,}/i.test(s)
  ) {
    return true;
  }
  if (/image_\d+\.(png|jpe?g|webp)/i.test(s)) return true;
  if (/\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(s) && !/^https?:\/\//i.test(s)) return true;
  return false;
}

function resolveAssetSrc(src: string, assetMap: Record<string, string>): string {
  const t = src.trim();
  if (t.startsWith("data:") || t.startsWith("https://") || t.startsWith("http://")) return t;
  const clean = t.replace(/^\.\//, "").replace(/^\//, "");
  if (assetMap[clean]) return assetMap[clean];
  if (assetMap[t]) return assetMap[t];
  return t;
}

/** Sustituye rutas locales por data URLs del proyecto; deja https intactas. */
export function repairHtmlMedia(html: string, assetMap: Record<string, string>): string {
  let out = html.replace(
    /(<img\b[^>]*\ssrc=)(["'])([^"']+)\2/gi,
    (_m, pre, q, src) => `${pre}${q}${resolveAssetSrc(src, assetMap)}${q}`,
  );
  out = out.replace(
    /(background(?:-image)?\s*:\s*url\()(["']?)([^"')]+)\2?\)/gi,
    (_m, pre, q, src) => `${pre}${q}${resolveAssetSrc(src, assetMap)}${q})`,
  );
  return out;
}

const IMG_SRC_RE = /<img\b[^>]*\ssrc=["']([^"']+)["']/gi;

function extractAltNearSrc(html: string, src: string): string {
  const esc = src.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<img\\b[^>]*\\ssrc=["']${esc}["'][^>]*\\salt=["']([^"']*)["']`, "i");
  const m = html.match(re);
  if (m?.[1]) return m[1];
  const re2 = new RegExp(`<img\\b[^>]*\\salt=["']([^"']*)["'][^>]*\\ssrc=["']${esc}["']`, "i");
  return re2.exec(html)?.[1] ?? src;
}

let _picsumSlot = 0;

export function isPaintThemedInstruction(text: string): boolean {
  return /pintura|coating|coatings|paint|barniz|fachada|latex|primer|premier|interior|exterior|mastering/i.test(
    text,
  );
}

/** Sustituye Picsum/Unsplash genéricos por semillas gafcore-paint-* (hero + productos). */
export function rewritePaintThemeMediaUrls(source: string, instruction = ""): string {
  if (!isPaintThemedInstruction(`${instruction}\n${source}`)) return source;
  let slot = 0;
  const nextUrl = () => {
    const isHero = slot === 0;
    const url = themedPicsumUrl(
      isHero ? "hero" : `product-${slot}`,
      instruction,
      slot,
      isHero ? 1280 : 600,
      isHero ? 720 : 600,
    );
    slot += 1;
    return url;
  };
  return source
    .replace(/https:\/\/picsum\.photos\/seed\/[^"'`)\s]+(?:\/\d+)?(?:\/\d+)?/g, nextUrl)
    .replace(/https:\/\/images\.unsplash\.com\/[^"'`)\s]+/g, nextUrl);
}

/** Rutas locales / rotas → Picsum temático; aplica a HTML y JSX. */
export function applyPicsumFallbacksInSource(
  source: string,
  instruction = "",
  assetMap: Record<string, string> = {},
): string {
  const resolveOrPicsum = (src: string, alt: string, hero = false): string => {
    const s = src.trim();
    if (assetMap && Object.keys(assetMap).length > 0) {
      const resolved = resolveAssetSrc(s, assetMap);
      if (resolved !== s && (resolved.startsWith("data:") || resolved.startsWith("http"))) {
        return resolved;
      }
    }
    if (!isUnresolvableImageSrc(s)) return s;
    return themedPicsumUrl(alt, instruction, _picsumSlot++, hero ? 1280 : 800, hero ? 720 : 600);
  };

  _picsumSlot = 0;
  let out = source.replace(IMG_SRC_RE, (tag, src: string) => {
    const s = src.trim();
    if (!isUnresolvableImageSrc(s) && !assetMap[s]) return tag;
    const alt = extractAltNearSrc(source, src);
    const url = resolveOrPicsum(s, alt, s.includes("hero"));
    return tag.replace(src, url);
  });
  out = out.replace(/src=\{["']([^"']+)["']\}/g, (tag, src: string) => {
    const url = resolveOrPicsum(src, src, false);
    if (url === src.trim() && isUnresolvableImageSrc(src)) {
      return `src={${JSON.stringify(themedPicsumUrl(src, instruction, _picsumSlot++, 600, 600))}}`;
    }
    if (url === src.trim()) return tag;
    return `src={${JSON.stringify(url)}}`;
  });
  out = out.replace(
    /(background(?:-image)?\s*:\s*url\()(["']?)([^"')]+)\2?\)/gi,
    (_m, pre, q, src: string) => {
      const url = resolveOrPicsum(src, "hero", true);
      return `${pre}${q}${url}${q})`;
    },
  );
  out = rewritePaintThemeMediaUrls(out, instruction);
  return out;
}

/** Reparación completa para preview / post-proceso. */
export function applyAllMediaRepairs(source: string, contextHint = ""): string {
  return applyPicsumFallbacksInSource(repairCommonJsxSyntaxErrors(source), contextHint);
}

/** @deprecated Usa applyPicsumFallbacksInSource */
export function applyPicsumFallbacksInHtml(html: string): string {
  return applyPicsumFallbacksInSource(html);
}

export const PREVIEW_IMG_FALLBACK_SCRIPT = `<script>
(function(){
  var seeds = ['gafcore-paint-hero-kitchen','gafcore-paint-product-1','gafcore-paint-product-2','gafcore-paint-product-3','gafcore-paint-product-4','gafcore-paint-product-5'];
  var si = 0;
  function fallback(img){
    if (img.dataset.gafcoreFb) return;
    img.dataset.gafcoreFb = '1';
    var label = (img.alt || img.getAttribute('data-seed') || 'gafcore-product').trim().slice(0,48);
    var seed = seeds[si++ % seeds.length];
    var w = img.width > 400 ? 1280 : 600;
    var h = img.height > 400 ? 720 : 600;
    img.src = 'https://picsum.photos/seed/' + encodeURIComponent(seed) + '/' + w + '/' + h;
  }
  function scan(){
    document.querySelectorAll('img').forEach(function(img){
      if (img.dataset.gafcoreBound) return;
      img.dataset.gafcoreBound = '1';
      img.addEventListener('error', function(){ fallback(img); });
      if (img.complete && img.naturalWidth === 0) fallback(img);
    });
  }
  scan();
  var obs = new MutationObserver(scan);
  obs.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(scan, 400);
  setTimeout(scan, 1200);
})();
<\/script>`;

export function injectPreviewFallbackScript(html: string): string {
  if (html.includes("dataset.gafcoreFb")) return html;
  if (html.includes("</body>")) return html.replace("</body>", `${PREVIEW_IMG_FALLBACK_SCRIPT}</body>`);
  return html + PREVIEW_IMG_FALLBACK_SCRIPT;
}

/**
 * Quita URLs pegadas entre atributos JSX.
 * Ej.: htmlFor="from"https://esm.sh/" className=… → htmlFor="from" className=…
 */
export function repairCommonJsxSyntaxErrors(source: string): string {
  let out = source.replace(/="([^"]*)"(https?:\/\/[^\s"'<>]+)\/?"?/g, '="$1" ');
  out = out.replace(/(\s)(https?:\/\/[^\s"'<>]+)\/?"(\s+[a-zA-Z_][\w-]*=)/g, "$1$3");
  out = out.replace(/\s+(https?:\/\/[^\s"'<>]+)(?=\s+[a-zA-Z_][\w-]*=)/g, " ");
  out = out.replace(/(\w)="([^"]*)"\s+"(\s+[a-zA-Z_][\w-]*=)/g, '$1="$2"$3');
  return out;
}

/** Repara sintaxis JSX en todos los módulos del proyecto (p. ej. al cargar desde DB). */
export function sanitizeProjectJsxFiles<T extends { name: string; content: string }>(
  files: T[],
): T[] {
  return files.map((f) => {
    if (!/\.(jsx|tsx|js|ts)$/i.test(f.name)) return f;
    const content = repairCommonJsxSyntaxErrors(f.content);
    return content !== f.content ? { ...f, content } : f;
  });
}

/** Repara HTML/JSX en archivos generados + contexto del proyecto. */
export function repairGafcoreProjectMedia(
  generated: ProjFile[],
  projectFiles: ProjFile[],
  instruction = "",
): ProjFile[] {
  const assetMap = buildAssetUrlMap([...projectFiles, ...generated]);
  return generated.map((f) => {
    if (!/\.(html|htm|jsx|tsx|js|css)$/i.test(f.name)) return f;
    let content = repairHtmlMedia(f.content, assetMap);
    content = repairCommonJsxSyntaxErrors(content);
    content = applyPicsumFallbacksInSource(content, instruction, assetMap);
    if (/\.html?$/i.test(f.name)) content = injectPreviewFallbackScript(content);
    return { ...f, content };
  });
}

const DATA_IMAGE_RE = /^data:image\/[a-z+]+;base64,/i;

export function extractVisionImageParts(
  files: ProjFile[],
  maxImages = 3,
  maxCharsPerImage = 280_000,
): { url: string; name: string }[] {
  const out: { url: string; name: string }[] = [];
  for (const f of files) {
    if (out.length >= maxImages) break;
    const c = f.content.trim();
    if (!DATA_IMAGE_RE.test(c)) continue;
    if (c.length > maxCharsPerImage) continue;
    out.push({ url: c, name: f.name });
  }
  return out;
}

/** Contexto JSON sin volcar base64 enormes al texto del modelo. */
export function filesContextForModel(files: ProjFile[]): ProjFile[] {
  return files.map((f) => {
    const c = f.content.trim();
    if (DATA_IMAGE_RE.test(c)) {
      return {
        ...f,
        content: `[Imagen embebida (${f.name}). Usa src="${f.name}" en HTML o replica el diseño; el preview la resolverá.]`,
        language: f.language ?? "plaintext",
      };
    }
    return f;
  });
}

export type ChatMessagePart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type GafcoreChatMessage =
  | { role: string; content: string }
  | { role: string; content: ChatMessagePart[] };

export function collectHttpImageUrlsFromFiles(files: ProjFile[]): string[] {
  const urls = new Set<string>();
  const re = /(?:src|href)=["'](https?:\/\/[^"']+)["']|url\(["']?(https?:\/\/[^"')]+)["']?\)/gi;
  for (const f of files) {
    if (!/\.(html|htm|jsx|tsx|js|css)$/i.test(f.name)) continue;
    let m: RegExpExecArray | null;
    const text = f.content;
    while ((m = re.exec(text)) !== null) {
      const u = m[1] || m[2];
      if (
        u &&
        (/\.(jpg|jpeg|png|webp|gif|svg)(\?|$)/i.test(u) ||
          /unsplash|picsum|placehold/i.test(u))
      ) {
        urls.add(u);
      }
    }
  }
  return [...urls];
}
