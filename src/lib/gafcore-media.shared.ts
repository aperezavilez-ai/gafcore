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

/** Rutas locales sin asset → picsum; mantiene data: y https que ya resolvieron. */
export function applyPicsumFallbacksInHtml(html: string): string {
  return html.replace(IMG_SRC_RE, (tag, src: string) => {
    const s = src.trim();
    if (s.startsWith("data:") || s.startsWith("https://") || s.startsWith("http://")) return tag;
    const seed = extractAltNearSrc(html, src);
    const url = picsumFallbackUrl(seed);
    return tag.replace(src, url);
  });
}

export const PREVIEW_IMG_FALLBACK_SCRIPT = `<script>
(function(){
  function fallback(img){
    if (img.dataset.gafcoreFb) return;
    img.dataset.gafcoreFb = '1';
    var seed = encodeURIComponent((img.alt || img.getAttribute('data-seed') || 'gafcore').trim().slice(0,48) || 'gafcore');
    img.src = 'https://picsum.photos/seed/' + seed + '/1280/720';
  }
  document.querySelectorAll('img').forEach(function(img){
    img.addEventListener('error', function(){ fallback(img); });
    if (img.complete && img.naturalWidth === 0) fallback(img);
  });
})();
<\/script>`;

export function injectPreviewFallbackScript(html: string): string {
  if (html.includes("dataset.gafcoreFb")) return html;
  if (html.includes("</body>")) return html.replace("</body>", `${PREVIEW_IMG_FALLBACK_SCRIPT}</body>`);
  return html + PREVIEW_IMG_FALLBACK_SCRIPT;
}

/** Repara HTML/JSX en archivos generados + contexto del proyecto. */
export function repairGafcoreProjectMedia(
  generated: ProjFile[],
  projectFiles: ProjFile[],
): ProjFile[] {
  const assetMap = buildAssetUrlMap([...projectFiles, ...generated]);
  return generated.map((f) => {
    if (!/\.(html|htm|jsx|tsx|js|css)$/i.test(f.name)) return f;
    let content = repairHtmlMedia(f.content, assetMap);
    if (/\.html?$/i.test(f.name)) {
      content = applyPicsumFallbacksInHtml(content);
      content = injectPreviewFallbackScript(content);
    }
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
