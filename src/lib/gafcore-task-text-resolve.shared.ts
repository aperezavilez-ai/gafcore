/** Claves para extraer texto legible de objetos en listas (evita React #31). */
export const TASK_TEXTO_OBJECT_KEYS = [
  "title",
  "label",
  "name",
  "heading",
  "value",
  "text",
  "desc",
] as const;

/**
 * Normaliza task.texto a string o null — sin ternarios anidados en JSX.
 * Usar dentro de .map() con if/return, antes del return del componente.
 */
export function resolveTaskTexto(texto: unknown): string | null {
  if (texto === null || texto === undefined) return null;
  if (typeof texto === "string") return texto;
  if (typeof texto === "number") return String(texto);
  if (typeof texto !== "object") return null;

  const record = texto as Record<string, unknown>;
  for (const key of TASK_TEXTO_OBJECT_KEYS) {
    const val = record[key];
    if (val === null || val === undefined) continue;
    if (typeof val === "string") return val;
    if (typeof val === "number") return String(val);
  }
  return null;
}

/** Snippet para inyectar en App.tsx si falta el helper. */
export const RESOLVE_TASK_TEXTO_HELPER_SNIPPET = `
const TASK_TEXTO_OBJECT_KEYS = ["title", "label", "name", "heading", "value", "text", "desc"];

function resolveTaskTexto(texto: unknown): string | null {
  if (texto === null || texto === undefined) return null;
  if (typeof texto === "string") return texto;
  if (typeof texto === "number") return String(texto);
  if (typeof texto !== "object") return null;
  const record = texto as Record<string, unknown>;
  for (const key of TASK_TEXTO_OBJECT_KEYS) {
    const val = record[key];
    if (val === null || val === undefined) continue;
    if (typeof val === "string") return val;
    if (typeof val === "number") return String(val);
  }
  return null;
}
`.trim();

/** Reemplazo canónico para listaProcesada con map defensivo roto. */
export const LISTA_PROCESADA_MAP_SNIPPET = `
  const listaProcesada = tasks.map((task) => {
    return resolveTaskTexto(task.texto);
  });
`.trim();

/** Patrón recomendado: sin .map() con ternarios en una línea (usa mapTaskToLabel + buildListaProcesada). */
export const LISTA_PROCESADA_FOR_LOOP_SNIPPET = `
  const listaProcesada: (string | null)[] = [];
  for (let i = 0; i < tasks.length; i++) {
    listaProcesada.push(resolveTaskTexto(tasks[i].texto));
  }
`.trim();
