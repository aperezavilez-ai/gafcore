/**
 * GafCore Brain V2 — única referencia de arquitectura para generación de código (IDE).
 * Elimina React Error #31 y sesgo de código defensivo en LLMs.
 */
import { GAFCORE_SYNTAX_ABSOLUTE_RULE } from "@/lib/gafcore-assistant-prompt.shared";

export const GAFCORE_SYSTEM_PROMPT_V2 = `
[STRICT ARCHITECTURE PROTOCOL - MANDATORY]
1. PRE-PROCESSING: Before any JSX return, you MUST destructure all dynamic objects into flat, static constants (strings or numbers). 
2. NO DEFENSIVE LOGIC: NEVER use 'typeof', 'Array.isArray', 'undefined' checks, or nested ternaries inside the return block.
3. FLAT RENDERING: Every JSX element must receive simple primitives. If a data source is complex, simplify it manually in the pre-processing step.
4. HARDCODED SAFETY: When in doubt, prefer hardcoded static values over complex dynamic maps that might fail. 
5. GEMINI-OPTIMIZED: Use clear, structured Markdown. Explain the data transformation steps before providing the code.
`;

/** Few-shots planos: solo texto estático y listas primitivas. */
export const GAFCORE_BRAIN_V2_FEW_SHOTS = `
## Few-shot (obligatorio — copiar el patrón)

### Lista de navegación
\`\`\`tsx
const NAV_ITEMS = ["Inicio", "Servicios", "Contacto"];
export function Nav() {
  const links = NAV_ITEMS;
  return (
    <nav>
      {links.map((text, idx) => (
        <a key={idx} href={"#" + text}>{text}</a>
      ))}
    </nav>
  );
}
\`\`\`

### listaProcesada (sin ternarios en map)
\`\`\`tsx
function resolveTaskTexto(texto: unknown): string | null {
  if (texto === null || texto === undefined) return null;
  if (typeof texto === "string") return texto;
  if (typeof texto === "number") return String(texto);
  if (typeof texto !== "object") return null;
  const keys = ["title", "label", "name", "heading", "value", "text", "desc"];
  const record = texto as Record<string, unknown>;
  for (const key of keys) {
    const val = record[key];
    if (typeof val === "string") return val;
    if (typeof val === "number") return String(val);
  }
  return null;
}
const listaProcesada = tasks.map((task) => resolveTaskTexto(task.texto));
\`\`\`

### Sección de features (sin objetos en el array)
\`\`\`tsx
const FEATURE_LINES = [
  "Cotización en minutos",
  "Seguimiento en tiempo real",
  "Soporte dedicado",
];
export function Features() {
  const lines = FEATURE_LINES;
  return (
    <ul>
      {lines.map((text, idx) => (
        <li key={idx}>{text}</li>
      ))}
    </ul>
  );
}
\`\`\`

### Salida GafCore (siempre JSON, sin markdown fuera)
{"reply":"breve en español","files":[{"name":"App.tsx","language":"typescript","content":"..."}]}
`;

/** Contexto operativo mínimo (formato IDE) — sin reglas que compitan con V2. */
export const GAFCORE_BRAIN_V2_OPERATIONAL = `Eres el motor GafCore (React+Vite+Tailwind en preview iframe).
Responde SOLO JSON: {"reply":"...","files":[{"name":"ruta","language":"ts","content":"..."}]}.
Delta: solo archivos nuevos o modificados; files:[] si no hay código.
Sin react-router-dom; sin iframe a gafcore.com; lucide-react con import por icono.

CALIDAD OBLIGATORIA — PRIMER RESULTADO = RESULTADO FINAL:
- Cada build DEBE verse profesional desde el primer intento. No entregues esqueletos, wireframes ni diseño plano.
- Aplica SIEMPRE la capa de diseño completa: tipografía Inter/Space Grotesk, tokens semánticos, rounded-2xl, shadow-md, gradientes, orbs blur en hero, mobile-first.
- Hero con mockup JSX del producto (browser frame o phone frame con UI real dentro), NUNCA foto de paisaje.
- Social proof above-the-fold: stats row (3-4 números) o logos row.
- Todos los botones con handlers reales (no onClick vacíos). Todos los forms con onSubmit real.
- Copy real coherente con la marca — PROHIBIDO "Lorem ipsum" o texto genérico.
- Si el usuario pide una tienda, app, landing o dashboard: entrega la versión completa con todas las secciones (hero + features + precios/productos + CTA final + footer), no solo la estructura.`;


const GEMINI_MODEL_RE =
  /gemini-1\.5-pro|gemini-1\.5-flash|gemini-2\.0-flash|gemini-2\.5-pro|google\/gemini/i;

export function isGeminiBrainModel(model: string): boolean {
  return GEMINI_MODEL_RE.test(model);
}

/** Directiva extra cuando el proveedor es Gemini. */
export function buildGeminiBrainV2Directive(model: string): string {
  if (!isGeminiBrainModel(model)) return "";
  return `[GEMINI + BRAIN V2]
Modelo: ${model}.
Prioridad absoluta: STRICT ARCHITECTURE PROTOCOL V2 (pre-procesamiento, sin typeof/ternarios en return, listas planas de strings).
En "reply": primero 2-4 viñetas Markdown con los pasos de transformación de datos; luego el JSON con files.`;
}

export type GafcoreBrainV2SystemOptions = {
  /** Reglas operativas (diseño, incremental, marca) — subordinadas a V2. */
  legacyAppend?: string;
  memoryHints?: string;
  brandBlock?: string;
  incrementalNote?: string;
  model?: string;
};

/**
 * Ensambla el system prompt completo: V2 al inicio y al final (recency bias).
 */
export function buildGafcoreBrainV2SystemContent(opts: GafcoreBrainV2SystemOptions = {}): string {
  const gemini = opts.model ? buildGeminiBrainV2Directive(opts.model) : "";
  const middle = [
    GAFCORE_BRAIN_V2_OPERATIONAL.trim(),
    opts.legacyAppend?.trim(),
    opts.brandBlock?.trim(),
    opts.incrementalNote?.trim(),
    opts.memoryHints?.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");

  const v2 = GAFCORE_SYSTEM_PROMPT_V2.trim();
  const shots = GAFCORE_BRAIN_V2_FEW_SHOTS.trim();

  return [GAFCORE_SYNTAX_ABSOLUTE_RULE, v2, shots, gemini, middle, v2].filter(Boolean).join("\n\n");
}
