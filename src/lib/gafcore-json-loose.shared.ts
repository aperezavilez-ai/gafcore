/**
 * Parser JSON tolerante para respuestas LLM.
 *
 * Los modelos a veces envuelven el JSON en code fences (```json ...```), añaden
 * texto introductorio, o cierran con texto extra. Esta función intenta varias
 * estrategias antes de rendirse.
 */

const FENCE_RE = /```(?:json|JSON)?\s*([\s\S]*?)```/;

/** Intenta parsear cualquier salida LLM como JSON. Devuelve null si imposible. */
export function parseJsonLoose<T = unknown>(raw: string): T | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 1) JSON puro
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    /* sigue */
  }

  // 2) Code fence ```json ... ```
  const fence = trimmed.match(FENCE_RE);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1].trim()) as T;
    } catch {
      /* sigue */
    }
  }

  // 3) Primer bloque {...} balanceado encontrado
  const first = findFirstBalancedBlock(trimmed, "{", "}");
  if (first) {
    try {
      return JSON.parse(first) as T;
    } catch {
      /* sigue */
    }
  }

  // 4) Objeto con clave "files" (prosa previa con llaves que confunden el primer bloque)
  const withFiles = tryParseObjectContainingFiles(trimmed);
  if (withFiles !== null) {
    return withFiles as T;
  }

  // 5) Primer array [...] balanceado
  const arr = findFirstBalancedBlock(trimmed, "[", "]");
  if (arr) {
    try {
      return JSON.parse(arr) as T;
    } catch {
      /* sigue */
    }
  }

  return null;
}

/** Busca el objeto `{ ... "files": ... }` aunque haya texto antes con `{` sueltos. */
function tryParseObjectContainingFiles(raw: string): unknown | null {
  const idx = raw.search(/"files"\s*:/);
  if (idx < 0) return null;
  const start = raw.lastIndexOf("{", idx);
  if (start < 0) return null;
  const block = findFirstBalancedBlock(raw.slice(start), "{", "}");
  if (!block) return null;
  try {
    return JSON.parse(block);
  } catch {
    return null;
  }
}

/** Devuelve el primer bloque balanceado entre open y close, respetando strings. */
function findFirstBalancedBlock(input: string, open: string, close: string): string | null {
  const start = input.indexOf(open);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < input.length; i += 1) {
    const ch = input[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return input.slice(start, i + 1);
    }
  }
  return null;
}
