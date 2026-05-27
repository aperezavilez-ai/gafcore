import { useDeferredValue, useMemo } from "react";
import type { FileItem } from "./CodeEditor";
import {
  buildAssetUrlMap,
  injectPreviewFallbackScript,
  PREVIEW_IMG_FALLBACK_SCRIPT,
  repairHtmlMedia,
  applyAllMediaRepairs,
  repairCommonJsxSyntaxErrors,
  sanitizeProjectJsxFiles,
} from "@/lib/gafcore-media.shared";
import {
  PREVIEW_REACT_SHIM_NAME,
  buildPreviewReactShimCode,
} from "@/lib/preview-iframe-jsx-guard.snippet";

const ESM = "https://esm.sh";

// React en modo prod (single instance) para evitar incompatibilidad de $$typeof
// entre módulos del usuario y deps transitivas. Los errores minificados los
// hacemos legibles capturando console.error en el iframe (ver script de error).
const REACT_DEPS: Record<string, string> = {
  react: `${ESM}/react@18.3.1`,
  "react-dom": `${ESM}/react-dom@18.3.1`,
  "react-dom/client": `${ESM}/react-dom@18.3.1/client`,
  "react/jsx-runtime": `${ESM}/react@18.3.1/jsx-runtime`,
};

function isJsModule(name: string) {
  return /\.(jsx?|tsx?|mjs)$/i.test(name);
}

function isCss(name: string) {
  return name.toLowerCase().endsWith(".css");
}

function stripExt(p: string) {
  return p.replace(/\.(jsx?|tsx?|mjs)$/i, "");
}

function resolveRelative(from: string, spec: string): string {
  // Resolve "./Foo" or "../Foo" against `from` filename (flat in our virtual fs)
  const baseDir = from.includes("/") ? from.slice(0, from.lastIndexOf("/")) : "";
  const stack = baseDir ? baseDir.split("/") : [];
  const parts = spec.split("/");
  for (const p of parts) {
    if (p === "." || p === "") continue;
    if (p === "..") stack.pop();
    else stack.push(p);
  }
  return stack.join("/");
}

function findFile(files: FileItem[], baseNoExt: string): FileItem | undefined {
  const exts = ["", ".tsx", ".jsx", ".ts", ".js", "/index.tsx", "/index.jsx", "/index.ts", "/index.js"];
  for (const e of exts) {
    const f = files.find((x) => x.name === baseNoExt + e);
    if (f) return f;
  }
  return undefined;
}

/** Rewrite import/export specifiers in source code. */
function rewriteImports(
  source: string,
  ownName: string,
  files: FileItem[],
  cssFiles: string[],
): string {
  // Matches: import ... from "x"  |  import "x"  |  export ... from "x"  |  dynamic import("x")
  const re = /((?:import|export)[\s\S]*?from\s*|import\s*|import\s*\(\s*)(["'])([^"']+)\2/g;
  return source.replace(re, (_m, lead, quote, spec) => {
    if (/^https?:\/\//.test(spec)) {
      return `${lead}${quote}${spec}${quote}`;
    }
    if (/\.css($|\?)/i.test(spec)) {
      return `${lead}${quote}data:text/javascript,${quote}`;
    }
    if (spec === "react") {
      return `${lead}${quote}app:${PREVIEW_REACT_SHIM_NAME}${quote}`;
    }
    if (spec === "react/jsx-runtime" || spec === "react/jsx-dev-runtime") {
      return `${lead}${quote}app:${PREVIEW_REACT_SHIM_NAME}${quote}`;
    }
    if (spec.startsWith(".") || spec.startsWith("/")) {
      const resolved = resolveRelative(ownName, spec);
      // CSS side-effect import
      if (isCss(resolved)) {
        if (cssFiles.includes(resolved)) return `${lead}${quote}data:text/javascript,${quote}`;
        return `${lead}${quote}data:text/javascript,${quote}`;
      }
      const target = findFile(files, stripExt(resolved));
      if (target) return `${lead}${quote}app:${target.name}${quote}`;
      // unresolved → leave as-is, browser will throw a clear error
      return `${lead}${quote}${spec}${quote}`;
    }
    // Bare module → esm.sh (or our map)
    if (REACT_DEPS[spec]) return `${lead}${quote}${REACT_DEPS[spec]}${quote}`;
    // strip subpath after pkg name to keep esm.sh happy
    return `${lead}${quote}${ESM}/${spec}${quote}`;
  });
}

export function LivePreview({ files }: { files: FileItem[] }) {
  /** Durante streaming de la IA, prioriza fluidez del IDE antes que cada frame del preview. */
  const deferredFiles = useDeferredValue(files);
  const srcDoc = useMemo(() => {
    const mediaContextHint = deferredFiles
      .map((f) => f.content)
      .join("\n")
      .slice(0, 4000);
    const sanitizedFiles = sanitizeProjectJsxFiles(
      deferredFiles.map((f) => ({ name: f.name, content: f.content })),
    );
    const userJsFiles = sanitizedFiles.filter((f) => isJsModule(f.name));
    const reactShim: FileItem = {
      name: PREVIEW_REACT_SHIM_NAME,
      content: buildPreviewReactShimCode(REACT_DEPS.react),
    };
    const jsFiles = [reactShim, ...userJsFiles];
    const cssFiles = deferredFiles.filter((f) => isCss(f.name));

    // If no JS modules at all → fall back to plain HTML preview
    const htmlFile = deferredFiles.find((f) => f.name.endsWith(".html"));
    const hasReactEntry = jsFiles.some((f) =>
      /(^|\/)(main|index|App)\.(jsx?|tsx?)$/i.test(f.name),
    );

    if (!hasReactEntry && htmlFile) {
      const css = cssFiles.map((f) => f.content).join("\n");
      const js = jsFiles.map((f) => f.content).join("\n");
      const assetMap = buildAssetUrlMap(
        deferredFiles.map((f) => ({ name: f.name, content: f.content })),
      );
      let html = repairHtmlMedia(htmlFile.content, assetMap);
      html = applyAllMediaRepairs(html, mediaContextHint);
      html = injectPreviewFallbackScript(html);
      return html
        .replace("</head>", `<style>${css}</style></head>`)
        .replace("</body>", `<script>${js}<\/script></body>`);
    }

    if (!hasReactEntry) {
      return `<!doctype html><html><body style="font-family:system-ui;color:#64748b;display:grid;place-items:center;height:100vh;background:#fafafa">
        <div style="text-align:center">
          <p>Sin punto de entrada.</p>
          <p style="font-size:12px">Crea <code>main.jsx</code>, <code>App.jsx</code> o <code>index.html</code>.</p>
        </div>
      </body></html>`;
    }

    // Build a virtual module map: app:filename -> blob URL of (Babel-transpiled at runtime) module
    const cssNames = cssFiles.map((f) => f.name);
    const assetMap = buildAssetUrlMap(
      deferredFiles.map((f) => ({ name: f.name, content: f.content })),
    );

    // Encode each module as its source string; the iframe transpiles + blob-URLs them.
    const modulesPayload = jsFiles.map((f) => {
      const source =
        f.name === PREVIEW_REACT_SHIM_NAME
          ? f.content
          : applyAllMediaRepairs(
              repairCommonJsxSyntaxErrors(repairHtmlMedia(f.content, assetMap)),
              mediaContextHint,
            );
      return {
        name: f.name,
        code: rewriteImports(source, f.name, jsFiles, cssNames),
      };
    });

    const cssPayload = cssFiles.map((f) => f.content).join("\n");

    const entry =
      userJsFiles.find((f) => /(^|\/)main\.(jsx?|tsx?)$/i.test(f.name))?.name ??
      userJsFiles.find((f) => /(^|\/)index\.(jsx?|tsx?)$/i.test(f.name))?.name ??
      userJsFiles.find((f) => /(^|\/)app\.(jsx?|tsx?)$/i.test(f.name))?.name ??
      userJsFiles.find((f) => /(^|\/)aplicaci[oó]n\.(jsx?|tsx?)$/i.test(f.name))?.name ??
      userJsFiles.find((f) => /createRoot\s*\(|ReactDOM\.render\s*\(/.test(f.content))?.name ??
      userJsFiles[0]?.name!;

    const importMap = {
      imports: {
        ...REACT_DEPS,
      },
    };

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Preview</title>
<style>
  body { margin: 0; font-family: system-ui, sans-serif; }
  #root { min-height: 100vh; }
  ${cssPayload}
</style>
<script src="https://cdn.tailwindcss.com"></script>
<script type="importmap">${JSON.stringify(importMap)}</script>
<script src="https://unpkg.com/@babel/standalone@7.25.6/babel.min.js"></script>
</head>
<body>
<div id="root"></div>
<div id="__err" style="display:none;position:fixed;inset:0;padding:20px;background:#fee;color:#900;font:12px ui-monospace,monospace;white-space:pre-wrap;overflow:auto;z-index:99999"></div>
<style id="__ve_css">
  .__ve_hover { outline: 2px dashed #3b82f6 !important; outline-offset: 2px !important; cursor: pointer !important; }
  .__ve_active { background: rgba(59,130,246,0.06) !important; }
  body.__ve_on, body.__ve_on * { user-select: none !important; }
</style>
<script>
(function(){
  let veOn = false;
  let lastHover = null;
  function describe(el){
    const tag = el.tagName.toLowerCase();
    const id = el.id ? '#' + el.id : '';
    const cls = (el.className && typeof el.className === 'string') ? '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.') : '';
    const txt = (el.innerText || '').trim().slice(0,60).replace(/\\s+/g,' ');
    return { selector: tag + id + cls, text: txt, tag };
  }
  function onMove(e){
    if (!veOn) return;
    const el = e.target;
    if (lastHover && lastHover !== el) lastHover.classList.remove('__ve_hover');
    if (el && el.classList) { el.classList.add('__ve_hover'); lastHover = el; }
  }
  function onClick(e){
    if (!veOn) return;
    e.preventDefault(); e.stopPropagation();
    const info = describe(e.target);
    parent && parent.postMessage({ type: 've-pick', info }, '*');
  }
  window.addEventListener('mousemove', onMove, true);
  window.addEventListener('click', onClick, true);
  window.addEventListener('message', (ev) => {
    if (ev.data && ev.data.type === 've-toggle') {
      veOn = !!ev.data.on;
      document.body.classList.toggle('__ve_on', veOn);
      if (!veOn && lastHover) { lastHover.classList.remove('__ve_hover'); lastHover = null; }
    }
  });
})();
</script>
<script>
(function(){
  const MODULES = ${JSON.stringify(modulesPayload)};
  const ENTRY = ${JSON.stringify(entry)};
  const blobMap = {};

  function repairJsxGlue(code) {
    return code.replace(/="([^"]*)"(https?:\\/\\/[^\\s"'<>]+)\\/?"?/g, '="$1" ');
  }

  function transpile(code, filename) {
    const presets = [["env",{ modules:false, targets:"defaults" }], "react"];
    if (/\\.(ts|tsx)$/i.test(filename)) presets.push(["typescript",{ allExtensions:true, isTSX:true }]);
    return Babel.transform(repairJsxGlue(code), { filename, presets, sourceMaps: "inline" }).code;
  }

  function neutralizeCssModuleSpecifiers(code) {
    return code
      .replace(/import\\s+["'][^"']*\\.css[^"']*["']\\s*;?/g, "")
      .replace(/import\\s+(\\w+)\\s+from\\s+["'][^"']*\\.css[^"']*["']\\s*;?/g, "const $1 = {};")
      .replace(/from\\s+["'][^"']*\\.css[^"']*["']/g, 'from "data:text/javascript,"')
      .replace(/import\\s*\\(\\s*["'][^"']*\\.css[^"']*["']\\s*\\)/g, 'import("data:text/javascript,")');
  }

  function rewriteAppSpecifiers(code) {
    // After Babel, "app:Foo.jsx" specifiers may have been preserved (Babel keeps strings as-is).
    const withAppUrls = code.replace(/(["'])app:([^"']+)\\1/g, function(_, q, name){
      const url = blobMap[name];
      if (!url) return q + "app:" + name + q;
      return q + url + q;
    });
    return neutralizeCssModuleSpecifiers(withAppUrls);
  }

  function decodeReactMinified(text) {
    var KNOWN = {
      "31": "Objects are not valid as a React child (received an object instead of a React element/string/number). Si quieres mostrar campos, accede a sus props (.title, .desc) o devuelve JSX al mapear.",
      "130": "Component type is invalid (expected a string/function but received an object). Probablemente importaste algo que no es un componente, o usas un objeto como tag.",
      "152": "createRoot was passed an invalid container (null o no es un elemento).",
      "200": "useState/useEffect called outside a component or before mount."
    };
    try {
      var m = /Minified React error #(\\d+)/.exec(text);
      if (!m) return text;
      var num = m[1];
      var argsMatch = text.match(/args\\[\\]=([^&\\s]+)/g);
      var argsList = argsMatch ? argsMatch.map(function(a){ return decodeURIComponent(a.replace('args[]=','')); }).join(' / ') : '';
      var human = KNOWN[num] || ("React error #" + num);
      // Si el último console.error capturado tiene info útil, anexarla.
      var captured = (window.__gafcore_last_console_error || "").toString();
      var extra = captured && captured.length < 1000 ? "\\n\\nDetalle React: " + captured : (argsList ? "\\n\\nDetalles: " + argsList : "");
      return human + extra;
    } catch (_) {
      return text;
    }
  }

  // Intercepta console.error para capturar el mensaje legible que React emite
  // antes de lanzar el error minificado en runtime.
  (function(){
    var origError = console.error.bind(console);
    console.error = function() {
      try {
        var parts = [];
        for (var i = 0; i < arguments.length; i++) {
          var a = arguments[i];
          if (a instanceof Error) parts.push(a.message);
          else if (typeof a === "string") parts.push(a);
          else { try { parts.push(JSON.stringify(a).slice(0, 300)); } catch(_) {} }
        }
        var msg = parts.join(" ").slice(0, 1200);
        if (msg && /react|object|child|invalid|render|hook|component/i.test(msg)) {
          window.__gafcore_last_console_error = msg;
        }
      } catch (_) {}
      return origError.apply(console, arguments);
    };
  })();

  function fmt(e) {
    if (!e) return "Error desconocido";
    var raw = "";
    if (e instanceof Error) raw = e.stack || e.message;
    else if (typeof e === "string") raw = e;
    else if (e && e.message) raw = e.message;
    else if (e && e.target && e.target.src) return "No se pudo cargar: " + e.target.src;
    else {
      try { raw = JSON.stringify(e); } catch (_) { raw = String(e); }
    }
    // Si tenemos un console.error capturado más legible, prefiérelo.
    var captured = (window.__gafcore_last_console_error || "").toString();
    if (captured && /react|child|render|invalid/i.test(captured) && !/Minified/i.test(captured)) {
      return captured + (raw && raw !== captured ? "\\n\\nStack: " + raw.slice(0, 800) : "");
    }
    return decodeReactMinified(raw);
  }
  var __gafLastPreviewErr = "";
  var __gafLastPreviewErrAt = 0;
  function showError(e) {
    // El Error Boundary ya muestra UI amigable dentro del #root.
    // Aquí solo emitimos al parent para que el auto-fix se entere.
    // El div __err queda como fallback escondido por si el boundary nunca monta.
    var msg = fmt(e);
    var now = Date.now();
    if (msg === __gafLastPreviewErr && now - __gafLastPreviewErrAt < 4000) return;
    __gafLastPreviewErr = msg;
    __gafLastPreviewErrAt = now;
    try {
      parent && parent.postMessage({ type: 'preview-error', message: msg }, '*');
    } catch (_) {}
    // Solo mostramos el div rojo si #root está vacío (es decir, ni siquiera
    // se montó el boundary). Esto cubre errores de carga del bundle inicial.
    var root = document.getElementById('root');
    if (root && !root.firstChild) {
      var el = document.getElementById('__err');
      if (el) {
        el.style.display = 'block';
        el.textContent = msg;
      }
    }
  }

  window.addEventListener('error', (ev) => showError(ev.error || ev));
  window.addEventListener('unhandledrejection', (ev) => showError(ev.reason));

  try {
    const transpiled = MODULES.map(m => ({ name: m.name, code: transpile(m.code, m.name) }));
    const byName = {};
    transpiled.forEach(m => { byName[m.name] = m; });

    // Build dep graph from "app:..." references inside each module's code
    const depsOf = (code) => {
      const out = [];
      const re = /["']app:([^"']+)["']/g;
      let mm;
      while ((mm = re.exec(code))) if (byName[mm[1]]) out.push(mm[1]);
      return out;
    };

    // Topological sort (DFS); cycles are tolerated (visited guard)
    const order = [];
    const seen = {};
    const visit = (name) => {
      if (seen[name]) return;
      seen[name] = true;
      const m = byName[name];
      if (!m) return;
      depsOf(m.code).forEach(visit);
      order.push(name);
    };
    transpiled.forEach(m => visit(m.name));

    // Build blobs in dependency order so dependents see final URLs of deps.
    order.forEach(name => {
      const m = byName[name];
      const code = rewriteAppSpecifiers(m.code);
      const blob = new Blob([code], { type: "text/javascript" });
      blobMap[name] = URL.createObjectURL(blob);
    });

    const entryUrl = blobMap[ENTRY];
    const entryModule = byName[ENTRY];
    const entryRaw = entryModule ? entryModule.code : "";
    // Treat as "main" if filename matches OR the file actually mounts itself.
    const isMain =
      /(^|\\/)main\\.(jsx?|tsx?)$/i.test(ENTRY) ||
      /\\bcreateRoot\\s*\\(/.test(entryRaw) ||
      /ReactDOM\\.render\\s*\\(/.test(entryRaw);

    const mountSrc = isMain
      ? \`import "\${entryUrl}";\`
      : \`
        import React from "react";
        import * as Entry from "\${entryUrl}";
        import { createRoot } from "react-dom/client";
        function pickComponent(mod) {
          if (!mod) return null;
          const candidates = [mod.default, mod.App, mod.Aplicacion, mod['Aplicación'], mod.Main, mod.Root, mod.Page];
          for (const c of candidates) if (typeof c === 'function') return c;
          for (const k of Object.keys(mod)) {
            const v = mod[k];
            if (typeof v === 'function' && /^[A-Z]/.test(k)) return v;
          }
          return null;
        }

        class GafcoreErrorBoundary extends React.Component {
          constructor(props) {
            super(props);
            this.state = { error: null, info: null };
          }
          static getDerivedStateFromError(error) {
            return { error: error };
          }
          componentDidCatch(error, info) {
            this.setState({ info: info });
            try {
              var msg = (error && error.message) || String(error);
              var stack = (info && info.componentStack) || "";
              // Anexa el componentStack al postMessage para que el auto-fix sepa
              // exactamente qué componente falló.
              parent && parent.postMessage({
                type: "preview-error",
                message: msg + (stack ? "\\\\n\\\\nComponente que falló:" + stack : "")
              }, "*");
            } catch (_) {}
          }
          render() {
            if (this.state.error) {
              var msg = (this.state.error && this.state.error.message) || String(this.state.error);
              var stack = (this.state.info && this.state.info.componentStack) || "";
              return React.createElement(
                "div",
                { style: { padding: "40px 24px", maxWidth: "800px", margin: "60px auto", fontFamily: "system-ui, -apple-system, sans-serif", color: "#1f2937" }},
                React.createElement("div", { style: { display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }},
                  React.createElement("div", { style: { width: "40px", height: "40px", borderRadius: "10px", background: "linear-gradient(135deg,#fef3c7,#fde68a)", display: "grid", placeItems: "center", fontSize: "20px" }}, "⚠"),
                  React.createElement("h1", { style: { fontSize: "20px", fontWeight: 700, margin: 0 }}, "El preview encontró un error de render")
                ),
                React.createElement("p", { style: { color: "#6b7280", marginBottom: "20px", lineHeight: 1.6 }}, "GafCore detectó el problema y ya está pidiéndole al cerebro IA que lo arregle automáticamente. Espera unos segundos."),
                React.createElement("div", { style: { padding: "16px", background: "#fef3c7", borderRadius: "10px", border: "1px solid #fde68a", marginBottom: "16px" }},
                  React.createElement("div", { style: { fontSize: "12px", fontWeight: 600, color: "#92400e", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}, "Mensaje"),
                  React.createElement("code", { style: { fontSize: "13px", color: "#78350f", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", whiteSpace: "pre-wrap", wordBreak: "break-word" }}, msg)
                ),
                stack ? React.createElement("details", { style: { fontSize: "12px", color: "#6b7280" }},
                  React.createElement("summary", { style: { cursor: "pointer", padding: "8px 0", fontWeight: 600 }}, "Componente afectado"),
                  React.createElement("pre", { style: { padding: "12px", background: "#f9fafb", borderRadius: "8px", overflow: "auto", fontSize: "11px", lineHeight: 1.5 }}, stack)
                ) : null
              );
            }
            return this.props.children;
          }
        }

        const Comp = pickComponent(Entry);
        const el = document.getElementById('root');
        if (Comp) {
          try {
            createRoot(el).render(
              React.createElement(GafcoreErrorBoundary, null, React.createElement(Comp))
            );
          } catch (e) {
            // Error sincrónico en el primer render: enviar al parent y mostrar amigable.
            try {
              parent && parent.postMessage({
                type: "preview-error",
                message: (e && e.message) || String(e)
              }, "*");
            } catch (_) {}
            el.innerHTML = '<div style="padding:40px 24px;max-width:600px;margin:60px auto;font-family:system-ui;color:#374151"><h1 style="font-size:18px;margin-bottom:12px">Error al iniciar el preview</h1><p style="color:#6b7280;margin-bottom:16px">GafCore lo está corrigiendo automáticamente.</p><pre style="padding:12px;background:#fef3c7;border-radius:8px;font-size:12px;color:#78350f;white-space:pre-wrap">' + ((e && e.message) || String(e)).replace(/</g,"&lt;") + '</pre></div>';
          }
        } else {
          const keys = Entry ? Object.keys(Entry).join(', ') || '(ninguno)' : '(módulo vacío)';
          el.innerHTML = '<pre style="padding:20px;color:#900;font:12px ui-monospace,monospace;white-space:pre-wrap">El archivo de entrada no exporta un componente válido.\\n\\nExports detectados: ' + keys + '\\n\\nAsegúrate de tener: export default function App() { ... }</pre>';
        }
      \`;
    const mountBlob = new Blob([mountSrc], { type: "text/javascript" });
    const s = document.createElement("script");
    s.type = "module";
    s.src = URL.createObjectURL(mountBlob);
    s.onerror = (e) => showError(e);
    document.body.appendChild(s);
  } catch (e) {
    showError(e);
  }
})();
</script>
${PREVIEW_IMG_FALLBACK_SCRIPT}
</body>
</html>`;
  }, [deferredFiles]);

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex-1 bg-white">
        <iframe
          title="preview"
          srcDoc={srcDoc}
          sandbox="allow-scripts allow-same-origin"
          className="h-full w-full border-0"
        />
      </div>
    </div>
  );
}
