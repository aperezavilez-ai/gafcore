import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GAFCORE_APPLE_TOUCH_ICON_PATH,
  GAFCORE_FAVICON_INLINE,
  GAFCORE_FAVICON_PATH,
  GAFCORE_FAVICON_SVG_PATH,
} from "./site-icons.shared";

type SpaShell = {
  css: string;
  js: string;
  /** HTML interior de <body> capturado en build (SSR ok); opcional. */
  bodyHtml?: string;
};

let cached: SpaShell | null | undefined;

function loadSpaShell(): SpaShell | null {
  if (cached !== undefined) return cached;
  const base = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(base, "gafcore-spa-shell.json"),
    join(base, "../gafcore-spa-shell.json"),
    join(base, "../../gafcore-spa-shell.json"),
    join(base, "../../../gafcore-spa-shell.json"),
  ];
  for (const path of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as SpaShell;
      if (parsed.css && parsed.js) {
        cached = parsed;
        return cached;
      }
    } catch {
      /* try next path */
    }
  }
  cached = null;
  return null;
}

/** Bootstrap mínimo $_TSR para que hydrateStart() funcione sin SSR previo. */
function buildTsrBootstrapScript(js: string, css: string): string {
  const jsLit = JSON.stringify(js);
  const cssLit = JSON.stringify(css);
  return `(self.$R=self.$R||{})["tsr"]=[];self.$_TSR={h(){this.hydrated=!0,this.c()},e(){this.streamEnded=!0,this.c()},c(){this.hydrated&&this.streamEnded&&(delete self.$_TSR,delete self.$R.tsr)},p(e){this.initialized?e():this.buffer.push(e)},buffer:[],hydrated:!1,streamEnded:!1,initialized:!1};$_TSR.router=($R=>$R[0]={manifest:$R[1]={routes:$R[2]={__root__:$R[3]={preloads:$R[4]=[${jsLit}],assets:$R[5]=[$R[6]={tag:"link",attrs:$R[7]={rel:"stylesheet",href:${cssLit},type:"text/css"}},$R[8]={tag:"script",attrs:$R[9]={type:"module",async:!0},children:"import("+${jsLit}+")"}]}}},matches:$R[10]=[],lastMatchId:void 0})($R["tsr"]);$_TSR.e();document.currentScript&&document.currentScript.remove();`;
}

const DEFAULT_BODY_HTML = `<!--$--><!--$--><div class="flex min-h-screen items-center justify-center bg-background text-foreground"><div class="flex flex-col items-center gap-3"><div role="status" aria-label="Cargando" class="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent"></div><p class="text-sm text-muted-foreground">Cargando GafCore…</p></div></div><!--/$-->`;

export function wantsHtmlDocument(request: Request): boolean {
  const path = new URL(request.url).pathname;
  if (path.startsWith("/api/") || path.includes("/_serverFn/")) return false;
  const accept = request.headers.get("accept") ?? "";
  // No usar */* — fetch del chat envía Accept: */* y convertía errores API en HTML SPA.
  return accept.includes("text/html");
}

/** HTML con bootstrap TSR: el client entry hidrata y renderiza en el navegador sin SSR. */
export function spaFallbackResponse(_request: Request): Response | null {
  const shell = loadSpaShell();
  if (!shell) return null;

  const bodyInner = shell.bodyHtml?.trim() || DEFAULT_BODY_HTML;
  const bootstrap = buildTsrBootstrapScript(shell.js, shell.css);

  const html = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GafCore</title>
    <link rel="icon" href="${GAFCORE_FAVICON_INLINE}" />
    <link rel="shortcut icon" href="${GAFCORE_FAVICON_INLINE}" />
    <link rel="icon" type="image/svg+xml" href="${GAFCORE_FAVICON_SVG_PATH}" />
    <link rel="icon" type="image/png" sizes="32x32" href="${GAFCORE_FAVICON_PATH}" />
    <link rel="apple-touch-icon" href="${GAFCORE_APPLE_TOUCH_ICON_PATH}" />
    <link rel="stylesheet" href="${shell.css}" type="text/css" />
    <link rel="modulepreload" href="${shell.js}" />
  </head>
  <body>
    ${bodyInner}
    <script class="$tsr" id="$tsr-stream-barrier">${bootstrap}</script>
    <script type="module" async="">import(${JSON.stringify(shell.js)})</script>
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-gafcore-spa-fallback": "1",
    },
  });
}
