import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type SpaShell = { css: string; js: string };

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

export function wantsHtmlDocument(request: Request): boolean {
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("text/html") || accept.includes("*/*");
}

/** HTML mínimo: el client entry de TanStack hidrata/renderiza en el navegador sin SSR. */
export function spaFallbackResponse(request: Request): Response | null {
  const shell = loadSpaShell();
  if (!shell) return null;

  const html = `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>GafCore</title>
    <link rel="stylesheet" href="${shell.css}" />
  </head>
  <body>
    <div id="gafcore-spa-fallback" class="flex min-h-screen items-center justify-center bg-background text-foreground">
      <p class="text-sm text-muted-foreground">Cargando GafCore…</p>
    </div>
    <script type="module" src="${shell.js}"></script>
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
