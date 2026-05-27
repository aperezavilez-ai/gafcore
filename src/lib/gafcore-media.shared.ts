import type { ProjFile } from "@/lib/gafcore-chat.shared";
import {
  prefersProductMockupHero,
  resolveHeroImageFromInstruction,
} from "@/lib/gafcore-hero-image.shared";

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
  if (label === "hero" || /hero|banner|fondo|cielo|avion|avión|viaje|vuelo/i.test(ctx)) {
    const theme = resolveHeroImageFromInstruction(instruction);
    if (theme.matched && theme.url) return theme.url;
    // Sin vertical con foto natural: no inyectamos foto random.
    return "";
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
  // SaaS / apps digitales: no inyectar fotos stock; el hero debe ser mockup JSX.
  if (
    prefersProductMockupHero(instruction) &&
    !isPaintThemedInstruction(`${instruction}\n${source}`)
  ) {
    return source;
  }

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
  const repaired = repairCommonJsxSyntaxErrors(source);
  if (
    prefersProductMockupHero(contextHint) &&
    !isPaintThemedInstruction(`${contextHint}\n${repaired}`)
  ) {
    return repaired;
  }
  return applyPicsumFallbacksInSource(repaired, contextHint);
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
/**
 * Símbolos de `lucide-react` que SOLO existen como tipos en TypeScript y rompen el
 * preview si se importan como runtime (esm.sh los excluye del bundle JS).
 */
const LUCIDE_TYPE_ONLY = new Set(["LucideIcon", "LucideProps", "IconNode", "LucideProvider"]);

/**
 * Whitelist embebida de iconos comunes de lucide-react. Cubre el 99% de los casos que
 * un LLM va a usar al generar UIs. Si el modelo importa un nombre fuera de esta lista
 * (e.g. "Note", "Cog", "Crosshair"), lo redirigimos a un sinónimo válido o a un fallback
 * neutro para que el preview NUNCA falle por un icono inexistente.
 */
const LUCIDE_VALID = new Set<string>([
  // arrows/movement
  "ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "ArrowUpRight", "ArrowDownRight",
  "ChevronRight", "ChevronLeft", "ChevronUp", "ChevronDown", "MoveRight", "Move",
  // ui
  "Menu", "X", "Plus", "Minus", "Check", "CheckCircle", "CheckCircle2", "Circle",
  "Square", "MoreHorizontal", "MoreVertical", "Search", "Filter", "Settings", "Settings2",
  "Sliders", "Home", "User", "Users", "UserPlus", "UserCheck", "LogIn", "LogOut",
  // status/alerts
  "AlertCircle", "AlertTriangle", "Info", "HelpCircle", "Loader", "Loader2", "Bell", "BellOff",
  // media
  "Image", "ImagePlus", "Video", "Camera", "Mic", "MicOff", "Play", "Pause", "Stop",
  "SkipBack", "SkipForward", "Volume", "Volume1", "Volume2", "VolumeX",
  // files/docs
  "File", "FileText", "FileCode", "FileImage", "FilePlus", "Folder", "FolderOpen",
  "Download", "Upload", "Save", "Trash", "Trash2", "Copy", "Clipboard", "ClipboardCheck",
  "ClipboardCopy", "ClipboardList", "ClipboardPaste",
  // notes
  "StickyNote", "Notebook", "NotebookText", "NotebookPen", "BookOpen", "Book", "BookmarkPlus",
  "Bookmark",
  // shapes/abstract
  "Sparkles", "Sparkle", "Star", "StarHalf", "Heart", "Zap", "Flame", "Lightbulb", "Sun", "Moon",
  // tech
  "Code", "Code2", "Terminal", "Cpu", "Database", "Server", "Cloud", "CloudDownload", "CloudUpload",
  "Wifi", "WifiOff", "Smartphone", "Tablet", "Laptop", "Monitor", "Keyboard", "Mouse", "MousePointer",
  // brand
  "Github", "Twitter", "Facebook", "Instagram", "Linkedin", "Youtube", "Twitch",
  // social/comm
  "Mail", "MessageSquare", "MessageCircle", "Send", "Share", "Share2", "Phone", "PhoneCall",
  "PhoneIncoming", "PhoneOutgoing",
  // commerce
  "ShoppingCart", "ShoppingBag", "CreditCard", "DollarSign", "Tag", "Tags", "Gift", "Package",
  "Receipt", "Wallet", "Banknote",
  // location/transport
  "MapPin", "Map", "Navigation", "Compass", "Globe", "Car", "Bike", "Truck", "Plane", "Train",
  "Bus", "Anchor",
  // time
  "Clock", "Calendar", "CalendarDays", "Timer", "AlarmClock", "History", "Hourglass",
  // misc useful
  "Eye", "EyeOff", "Lock", "Unlock", "Key", "Shield", "ShieldCheck", "ShieldAlert",
  "Edit", "Edit2", "Edit3", "Pencil", "PenTool", "PenLine", "Trash", "Trash2",
  "Link", "Link2", "ExternalLink", "Paperclip", "Tag", "Award", "Trophy", "Target",
  "Briefcase", "Building", "Building2", "Store", "Coffee", "Utensils", "Pizza", "Wine",
  "Activity", "TrendingUp", "TrendingDown", "BarChart", "BarChart2", "BarChart3", "BarChart4",
  "LineChart", "PieChart", "Gauge",
  "Brain", "Bot", "Robot",
  "RefreshCw", "RotateCw", "RotateCcw", "Power", "Plug", "Battery", "BatteryCharging",
  "ThumbsUp", "ThumbsDown", "Smile", "Frown", "Meh",
  "Layers", "Layout", "LayoutGrid", "LayoutList", "Columns", "Rows", "Grid", "Grid2x2", "Grid3x3",
  "Maximize", "Maximize2", "Minimize", "Minimize2", "Expand", "Shrink", "Move", "Pin",
  // form
  "Type", "Hash", "AtSign", "Quote", "Bold", "Italic", "Underline", "Strikethrough",
  "AlignLeft", "AlignCenter", "AlignRight", "AlignJustify",
  // type-only (incluidos en whitelist para que pasen al detector type-only abajo)
  "LucideIcon", "LucideProps", "IconNode", "LucideProvider",
]);

/**
 * Mapa de errores comunes del LLM → icono real equivalente.
 * Cuando un import contiene una de estas claves, se sustituye por su valor.
 */
const LUCIDE_SYNONYMS: Record<string, string> = {
  Note: "StickyNote",
  Notes: "NotebookText",
  Notepad: "NotebookText",
  Cog: "Settings",
  Gear: "Settings",
  Trashcan: "Trash2",
  Recycle: "Trash2",
  Magnifier: "Search",
  Magnify: "Search",
  Pen: "PenLine",
  Document: "FileText",
  Doc: "FileText",
  Picture: "Image",
  Photo: "Image",
  Cart: "ShoppingCart",
  Bag: "ShoppingBag",
  Money: "DollarSign",
  Cash: "Banknote",
  Email: "Mail",
  Envelope: "Mail",
  Inbox: "Mail",
  Chat: "MessageSquare",
  Comment: "MessageCircle",
  Robot: "Bot",
  AI: "Sparkles",
  Idea: "Lightbulb",
  Bulb: "Lightbulb",
  Flash: "Zap",
  Thunderbolt: "Zap",
  Fire: "Flame",
  Tick: "Check",
  Cross: "X",
  Close: "X",
  Cancel: "X",
  Cogwheel: "Settings",
  Wrench: "Settings2",
  Light: "Sun",
  Dark: "Moon",
  Profile: "User",
  Account: "User",
  Person: "User",
  People: "Users",
  Group: "Users",
  Team: "Users",
  Globe2: "Globe",
  World: "Globe",
  Earth: "Globe",
  Location: "MapPin",
  Pin: "MapPin",
  Place: "MapPin",
  Time: "Clock",
  Date: "Calendar",
  Schedule: "Calendar",
  Stopwatch: "Timer",
  Eye2: "Eye",
  View: "Eye",
  Hide: "EyeOff",
  Show: "Eye",
  Padlock: "Lock",
  Security: "Shield",
  Shop: "Store",
  Cup: "Coffee",
  Drink: "Coffee",
  Food: "Utensils",
  Burger: "Utensils",
  Plug2: "Plug",
  Trending: "TrendingUp",
  Up: "TrendingUp",
  Down: "TrendingDown",
  Stats: "BarChart3",
  Chart: "BarChart3",
  Graph: "LineChart",
  Speed: "Gauge",
  Reload: "RefreshCw",
  Refresh: "RefreshCw",
  Restart: "RotateCw",
  Undo: "RotateCcw",
  Redo: "RotateCw",
  Battery2: "Battery",
  Like: "ThumbsUp",
  Dislike: "ThumbsDown",
  Happy: "Smile",
  Sad: "Frown",
  Stack: "Layers",
  Grid2: "Grid2x2",
  Fullscreen: "Maximize",
  FullscreenExit: "Minimize",
  Tag2: "Tag",
  Label: "Tag",
};

const LUCIDE_FALLBACK = "Square"; // icono neutro disponible siempre.

/**
 * Reescribe imports de lucide-react para que TODOS los nombres importados sean válidos:
 * - LucideIcon / LucideProps / IconNode → `type` import (no runtime).
 * - Sinónimos comunes (`Note`, `Cog`, etc.) → equivalente real.
 * - Nombres desconocidos → `Square` (fallback neutro) + renombrado del uso en JSX.
 *
 * Si un nombre no está en la whitelist y tampoco en el mapa de sinónimos, lo reemplazamos
 * por `Square` y renombramos todas las referencias al símbolo en el archivo para que el
 * código siga compilando.
 */
function fixLucideTypeImports(source: string): string {
  const renamesByFile = new Map<string, string>(); // nombre original → nombre final
  let modified = source.replace(
    /import\s*\{([^}]+)\}\s*from\s*["']lucide-react["']/g,
    (full, members: string) => {
      const parts = members.split(",").map((s) => s.trim()).filter(Boolean);
      const runtime: string[] = [];
      const types: string[] = [];
      const seen = new Set<string>();
      let changed = false;
      for (const p of parts) {
        const m = p.match(/^(?:type\s+)?([A-Za-z_]\w*)(?:\s+as\s+([A-Za-z_]\w*))?$/);
        if (!m) {
          runtime.push(p);
          continue;
        }
        const base = m[1];
        const alias = m[2];
        const importedAs = alias ?? base;

        if (LUCIDE_TYPE_ONLY.has(base)) {
          const entry = /^type\s+/.test(p) ? p : `type ${p}`;
          if (!seen.has(entry)) {
            types.push(entry);
            seen.add(entry);
          }
          changed = changed || !/^type\s+/.test(p);
          continue;
        }

        // Resuelve nombre válido: válido directo > sinónimo > fallback.
        let resolved: string;
        if (LUCIDE_VALID.has(base)) {
          resolved = base;
        } else if (LUCIDE_SYNONYMS[base]) {
          resolved = LUCIDE_SYNONYMS[base];
          changed = true;
        } else {
          resolved = LUCIDE_FALLBACK;
          changed = true;
        }

        if (resolved !== base) {
          // Mantener el alias usado en el código original; si no había, renombrar usos.
          if (alias) {
            const newEntry = `${resolved} as ${alias}`;
            if (!seen.has(newEntry)) {
              runtime.push(newEntry);
              seen.add(newEntry);
            }
          } else {
            // Usar alias al nombre original para no romper referencias JSX.
            const newEntry = `${resolved} as ${base}`;
            if (!seen.has(newEntry)) {
              runtime.push(newEntry);
              seen.add(newEntry);
            }
            renamesByFile.set(base, base); // ya está aliasado, no hay que renombrar usos.
          }
        } else {
          const entry = alias ? `${base} as ${alias}` : base;
          if (!seen.has(entry)) {
            runtime.push(entry);
            seen.add(entry);
          }
        }
      }
      if (!changed) return full;
      const merged = [...runtime, ...types].join(", ");
      return `import { ${merged} } from "lucide-react"`;
    },
  );
  // No renames pendientes (siempre alias al nombre original arriba), pero dejamos
  // el hook para futuro si se necesita.
  void renamesByFile;
  return modified;
}

/** Reemplaza `href=""` o `href="#"` por `href="#section"` (evita warnings de a11y). */
function fixEmptyAnchors(source: string): string {
  return source
    .replace(/href=""/g, 'href="#"')
    // a "vacío" sin href → role="button" para a11y, mantiene visual
    .replace(/<a(\s+[^>]*?)(?<!href=)>/g, (m, attrs) => {
      if (/href=/.test(attrs)) return m;
      return `<a${attrs} href="#">`;
    });
}

/**
 * Defensa local contra "Objects are not valid as a React child" (React error #31).
 *
 * Detecta variables declaradas como objetos/arrays literales y envuelve sus
 * usos en posición JSX con un wrapper seguro que:
 *   - Si es ReactElement (tiene $$typeof) → lo deja pasar.
 *   - Si es objeto plano → muestra title/label/name o cadena vacía.
 *   - Si es array → no lo toca (asumimos que ya tenían .map).
 *   - Si es primitivo → lo deja pasar.
 *
 * Esto evita que un bug del LLM ("renderizar `{feature}` cuando feature es
 * objeto") rompa toda la página. El render no será perfecto, pero el preview
 * no quedará en pantalla roja y el auto-fix con IA podrá iterar.
 */
function safeJsxChildExpr(name: string): string {
  return (
    "{(" +
    `(${name} == null) ? null :` +
    ` (typeof ${name} === 'string' || typeof ${name} === 'number' || typeof ${name} === 'boolean') ? ${name} :` +
    ` Array.isArray(${name}) ? null :` +
    ` (typeof ${name} === 'object' ? (${name}.title ?? ${name}.label ?? ${name}.name ?? ${name}.heading ?? '') : null)` +
    ")}"
  );
}

function fixObjectAsJsxChild(source: string): string {
  const objectVars = new Set<string>();
  const declRe = /\b(?:const|let|var)\s+(\w+)\s*=\s*([\[{])/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(source))) {
    if (m[2] === "[") {
      const after = source.slice(declRe.lastIndex, declRe.lastIndex + 12);
      if (!/^\s*\{/.test(after)) continue;
    }
    objectVars.add(m[1]);
  }

  let out = source;
  const objectArrayVars = new Set<string>();

  // `.map(item => item)` cuando item es objeto → mostrar campo legible, no el objeto entero.
  out = out.replace(
    /\.map\(\s*\(?(\w+)\)?\s*=>\s*\1\s*\)/g,
    (match, name: string) => {
      const safe =
        `(typeof ${name} === 'object' && ${name} != null && !${name}.$$typeof` +
        ` ? (${name}.title ?? ${name}.label ?? ${name}.name ?? ${name}.heading ?? '') : ${name})`;
      return `.map((${name}) => ${safe})`;
    },
  );

  // Corrige `{ {...obj} }` usado por error como child JSX.
  out = out.replace(
    /\{\s*\{\s*\.\.\.\s*(\w+)\s*\}\s*\}/g,
    (_m, name: string) => safeJsxChildExpr(name),
  );

  // Marca arrays literales de objetos: `const items = [{ ... }]`
  // para reforzar reparaciones dentro de callbacks JSX.
  const objectArrayDeclRe = /\b(?:const|let|var)\s+(\w+)\s*=\s*\[\s*\{/g;
  while ((m = objectArrayDeclRe.exec(source))) {
    objectArrayVars.add(m[1]);
  }

  // Si se mapea un array de objetos y se renderiza `{item}` en JSX,
  // reemplaza por un wrapper seguro para evitar React #31.
  //
  // Ejemplo:
  //   features.map((feature) => <li>{feature}</li>)
  // → features.map((feature) => <li>{(...safe...)}</li>)
  for (const listName of objectArrayVars) {
    const mapParamRe = new RegExp(
      `${listName}\\.map\\(\\s*\\(?\\s*(\\w+)\\s*\\)?\\s*=>`,
      "g",
    );
    const callbackParams = new Set<string>();
    let mapMatch: RegExpExecArray | null;
    while ((mapMatch = mapParamRe.exec(out))) {
      callbackParams.add(mapMatch[1]);
    }
    for (const param of callbackParams) {
      const bareChild = new RegExp(`\\{${param}\\}(?!\\.)`, "g");
      out = out.replace(bareChild, safeJsxChildExpr(param));
    }
  }

  if (objectVars.size === 0) return out;

  for (const name of objectVars) {
    const bareChild = new RegExp(`\\{${name}\\}(?!\\.)`, "g");
    out = out.replace(bareChild, safeJsxChildExpr(name));
  }

  return out;
}

export function repairCommonJsxSyntaxErrors(source: string): string {
  let out = source.replace(/="([^"]*)"(https?:\/\/[^\s"'<>]+)\/?"?/g, '="$1" ');
  out = out.replace(/(\s)(https?:\/\/[^\s"'<>]+)\/?"(\s+[a-zA-Z_][\w-]*=)/g, "$1$3");
  out = out.replace(/\s+(https?:\/\/[^\s"'<>]+)(?=\s+[a-zA-Z_][\w-]*=)/g, " ");
  out = out.replace(/(\w)="([^"]*)"\s+"(\s+[a-zA-Z_][\w-]*=)/g, '$1="$2"$3');
  out = fixLucideTypeImports(out);
  out = fixEmptyAnchors(out);
  out = fixObjectAsJsxChild(out);
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

/** Si pidieron cambio de fondo/hero: reemplaza bloque azul por imagen acorde al pedido. */
export function applyTravelHeroBackgroundFix(source: string, instruction: string): string {
  if (
    !/ciudad|city|skyline|viaje|cielos?|avion|avión|hotel|playa|montañ|paisaje/i.test(
      instruction,
    )
  ) {
    // Solo activamos este fix si la instrucción es claramente de un vertical de viaje/paisaje.
    return source;
  }
  const theme = resolveHeroImageFromInstruction(instruction);
  if (!theme.matched || !theme.url) return source;
  const heroUrl = theme.url;
  if (/backgroundImage|background-image|picsum\.photos/i.test(source)) {
    return source.replace(
      /https:\/\/picsum\.photos\/seed\/[^"'`)\s]+(?:\/\d+)?(?:\/\d+)?/gi,
      heroUrl,
    );
  }

  const styleSnippet = `style={{ backgroundImage: "url('${heroUrl}')", backgroundSize: "cover", backgroundPosition: "center" }}`;

  let out = source.replace(
    /className="([^"]*\b(?:min-h-screen|min-h-\[[^\]]+|h-screen)[^"]*\bbg-(?:blue|primary)(?:-\d+)?[^"]*)"/gi,
    (_m, cls) =>
      `className="${cls.replace(/\bbg-(?:blue|primary)(?:-\d+)?\b/g, "bg-cover bg-center")}" ${styleSnippet}`,
  );

  out = out.replace(
    /className="([^"]*\bbg-blue-\d+[^"]*)"/gi,
    (m, cls) => {
      if (!/\b(min-h-|h-screen|hero|flex-1)\b/i.test(cls)) return m;
      if (/backgroundImage|picsum/i.test(m)) return m;
      return `className="${cls.replace(/\bbg-blue-\d+\b/, "bg-cover bg-center")}" ${styleSnippet}`;
    },
  );

  return out;
}

/** Si la IA devolvió files:[] pero el usuario pidió un cambio visual, parchea archivos del proyecto. */
export function patchProjectFilesVisually(
  projectFiles: ProjFile[],
  instruction: string,
): ProjFile[] {
  if (!instruction.trim() || projectFiles.length === 0) return [];
  const wants =
    /ciudad|city|fondo|banner|hero|imagen|azul|skyline|viaje|cielos|cambia|modifica|aplica|background/i.test(
      instruction,
    );
  if (!wants) return [];

  const assetMap = buildAssetUrlMap(projectFiles);
  const out: ProjFile[] = [];
  for (const f of projectFiles) {
    if (!/\.(html|htm|jsx|tsx|js|css)$/i.test(f.name)) continue;
    let content = repairHtmlMedia(f.content, assetMap);
    content = repairCommonJsxSyntaxErrors(content);
    content = applyTravelHeroBackgroundFix(content, instruction);
    content = applyPicsumFallbacksInSource(content, instruction, assetMap);
    if (content !== f.content) {
      out.push({ name: f.name, language: f.language, content });
    }
  }
  return out;
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
    content = applyTravelHeroBackgroundFix(content, instruction);
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
