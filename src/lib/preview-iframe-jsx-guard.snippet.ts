/**
 * Guardia de preview: NO muta namespace ESM (evita "Cannot assign to property 'jsx'").
 * Exporta jsx/jsxs/createElement envueltos desde un único shim.
 */

const PREVIEW_JSX_GUARD_HELPERS = `
function __gafcoreCoerceChild(v) {
  if (v == null || typeof v === "boolean") return v;
  if (typeof v === "string" || typeof v === "number") return v;
  if (typeof v === "function") {
    try {
      return ReactOriginal.createElement(v, { className: "h-5 w-5 shrink-0", "aria-hidden": true });
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
`;

/** @deprecated Solo para compat; el mount ya no lo usa. */
export const PREVIEW_IFRAME_JSX_GUARD = "";

/** Módulo virtual: reemplaza imports de `react` y `react/jsx-runtime` en el preview. */
export const PREVIEW_REACT_SHIM_NAME = "__gafcore_preview_react.js";

/** @deprecated Usar PREVIEW_REACT_SHIM_NAME */
export const PREVIEW_JSX_RUNTIME_SHIM_NAME = PREVIEW_REACT_SHIM_NAME;

export function buildPreviewJsxRuntimeShimCode(reactEsmBase: string): string {
  return buildPreviewReactShimCode(reactEsmBase);
}

/** Shim ESM sin mutar módulos importados (compatible con esm.sh). */
export function buildPreviewReactShimCode(reactEsmBase: string): string {
  const base = reactEsmBase.replace(/\/$/, "");
  return `
import ReactOriginal from "${base}";
import { jsx as __jsxOrig, jsxs as __jsxsOrig, Fragment } from "${base}/jsx-runtime";
${PREVIEW_JSX_GUARD_HELPERS}
var __gafcoreCe = ReactOriginal.createElement.bind(ReactOriginal);
var React = Object.assign({}, ReactOriginal, {
  createElement: function(type, props) {
    var rest = Array.prototype.slice.call(arguments, 2).map(__gafcoreCoerceChild);
    return __gafcoreCe.apply(ReactOriginal, [type, props].concat(rest));
  },
});
export default React;
export function jsx(type, props, key) {
  return __jsxOrig(type, __gafcoreSanitizeProps(props), key);
}
export function jsxs(type, props, key) {
  return __jsxsOrig(type, __gafcoreSanitizeProps(props), key);
}
export { Fragment };
`.trim();
}
