/**
 * Código inyectado en el iframe de LivePreview antes de cargar el entry.
 * Evita React error #31 convirtiendo objetos planos en texto/fragmentos seguros.
 */
export const PREVIEW_IFRAME_JSX_GUARD = `
function __gafcoreCoerceChild(v) {
  if (v == null || typeof v === "boolean") return v;
  if (typeof v === "string" || typeof v === "number") return v;
  if (typeof v === "function") {
    try {
      return React.createElement(v, { className: "h-5 w-5 shrink-0", "aria-hidden": true });
    } catch (_) {
      return null;
    }
  }
  if (Array.isArray(v)) {
    var out = [];
    for (var i = 0; i < v.length; i++) {
      var c = __gafcoreCoerceChild(v[i]);
      if (c != null && c !== "") out.push(c);
    }
    return out;
  }
  if (typeof v === "object") {
    if (v.$$typeof) return v;
    if (v.type != null && v.props != null) {
      var inner = v.props.children;
      if (inner == null) inner = v.props.title || v.props.label || v.props.name || "";
      return __gafcoreCoerceChild(inner);
    }
    var t = v.title || v.label || v.name || v.heading || v.value || v.text || v.desc;
    return t != null && t !== "" ? t : null;
  }
  return null;
}
function __gafcoreSanitizeProps(p) {
  if (!p || p.children == null) return p;
  var ch = p.children;
  if (Array.isArray(ch)) {
    var next = [];
    for (var j = 0; j < ch.length; j++) {
      var x = __gafcoreCoerceChild(ch[j]);
      if (x != null && x !== "") next.push(x);
    }
    return Object.assign({}, p, { children: next.length === 1 ? next[0] : next });
  }
  return Object.assign({}, p, { children: __gafcoreCoerceChild(ch) });
}
function __gafcoreInstallJsxGuard(React, JSX) {
  if (JSX && JSX.jsx && !JSX.__gafPatched) {
    var _jsx = JSX.jsx;
    var _jsxs = JSX.jsxs;
    JSX.jsx = function(t, p, k) { return _jsx(t, __gafcoreSanitizeProps(p), k); };
    JSX.jsxs = function(t, p, k) { return _jsxs(t, __gafcoreSanitizeProps(p), k); };
    JSX.__gafPatched = true;
  }
  if (React && React.createElement && !React.__gafPatched) {
    var _ce = React.createElement;
    React.createElement = function(t, p) {
      var rest = Array.prototype.slice.call(arguments, 2);
      var safe = rest.map(__gafcoreCoerceChild);
      return _ce.apply(React, [t, p].concat(safe));
    };
    React.__gafPatched = true;
  }
}
__gafcoreInstallJsxGuard(React, __gafJsx);
`;

/** Nombre del módulo virtual que parchea jsx/jsxs para todo el preview. */
export const PREVIEW_JSX_RUNTIME_SHIM_NAME = "__gafcore_jsx_shim.js";

/** Shim ESM: todos los imports de react/jsx-runtime deben apuntar aquí. */
export function buildPreviewJsxRuntimeShimCode(reactEsmBase: string): string {
  const base = reactEsmBase.replace(/\/$/, "");
  return `
import React from "${base}";
import * as __gafJsx from "${base}/jsx-runtime";
${PREVIEW_IFRAME_JSX_GUARD}
export const jsx = __gafJsx.jsx;
export const jsxs = __gafJsx.jsxs;
export const Fragment = __gafJsx.Fragment;
`.trim();
}
