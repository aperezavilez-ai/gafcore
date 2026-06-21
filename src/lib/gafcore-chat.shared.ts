import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  extractVisionImageParts,
  filesContextForModel,
  type GafcoreChatMessage,
} from "@/lib/gafcore-media.shared";
import { instructionNeedsLayoutModel } from "@/lib/gafcore-layout-instruction.shared";
import { isSubstantiveBuildRequest } from "@/lib/gafcore-chat-intent.shared";
import { GAFCORE_DESIGN_SYSTEM } from "@/lib/gafcore-design-system.shared";
import { buildGafcoreBrainV2SystemContent } from "@/lib/gafcore-brain-v2";
import {
  buildAgentModeAppend,
  buildAgentProjectContext,
  isGafcoreBrainV2Only,
} from "@/lib/gafcore-brain-agent.shared";
import {
  GAFCORE_DESIGN_CONDENSED,
  GAFCORE_SYSTEM_CONDENSED,
} from "@/lib/gafcore-system-prompt-condensed.shared";
import {
  buildDesignMotorPromptAppend,
  inferAiBrainTaskFromInstruction,
} from "@/services/ai/design-engine.shared";
import { prepareIncrementalEditSession } from "@/lib/gafcore-incremental-edit.shared";
import { buildIntegrityShieldPromptAppend, GAFCORE_INTEGRITY_SHIELD_RULE } from "@/lib/gafcore-integrity-shield.shared";
import { GAFCORE_ANTHROPIC_MODEL_DEFAULT } from "@/lib/gafcore-assistant-prompt.shared";

export const gafcoreChatBodySchema = z.object({
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().max(20000),
      }),
    )
    .max(20),
  instruction: z.string().min(1).max(8000),
  files: z
    .array(
      z.object({
        name: z.string(),
        language: z.string().optional(),
        content: z.string(),
      }),
    )
    .max(80),
  projectId: z.string().uuid().optional(),
  /** Modo profundo del IDE (interruptor «Profundo ON»). */
  deepMode: z.boolean().optional(),
});

export type GafcoreChatBody = z.infer<typeof gafcoreChatBodySchema>;

export const GAFCORE_SYSTEM = `Eres el motor de generación de **GafCore**: produces software mantenible, no maquetas desechables.

Pilares (aplícalos en cada cambio):
1) **Clean Code / precisión**: código claro, nombres expresivos, DRY, sin código muerto. No añadas librerías ni utilidades que no se usen o que la instrucción no pida.
2) **APIs modernas del stack del proyecto**: respeta el stack que ves en los archivos (p. ej. React 19 + TanStack Router/Start + Vite + Tailwind v4, o Next si el repo es Next). Usa hooks y patrones actuales; evita APIs deprecadas o estilos de framework antiguo salvo que el código existente lo imponga.
3) **Arquitectura escalable**: al crecer UI o features, orienta a **Atomic Design** bajo \`src/components/\` (\`atoms\`, \`molecules\`, \`organisms\`, \`templates\` o equivalente ya usado en el repo). Evita un solo archivo monolítico cuando el cambio lo permite.
4) **Razonamiento de alta calidad**: piensa como modelo clase GPT-4o / Claude 3.5 (correctitud, menos idas y vueltas): el diff debe ser coherente con imports, rutas y tipos existentes.
5) **Rendimiento (p. ej. despliegue en Vercel)**: menos JS innecesario, componentes acotados, evita dependencias pesadas sin motivo; lazy solo cuando tenga sentido claro.
6) **Vista previa del IDE GafCore (iframe, sin servidor de estáticos)**: el código se ejecuta en el navegador del usuario, no hay carpeta \`public/\` mágica salvo que **añadas** esos archivos al delta.
   - **Prohibido** incrustar o enlazar el propio IDE/app de GafCore dentro del proyecto (no \`iframe\` ni \`href\`/navegación a \`gafcore.com/gafcore\`, \`/gafcore/app\`, localhost del IDE, ni "capturas del editor dentro de la landing"). Si detectas eso en código existente, elimínalo y reemplázalo por contenido real del negocio.
   - **Imágenes en landings (regla por vertical)**:
     * **SaaS / app / dashboard / productividad / IA / fintech / dev tools**: el hero y la zona principal usan **mockup del producto en JSX + Tailwind** (browser/phone frame con UI real dentro). **PROHIBIDO** foto random de paisaje, Picsum genérico o Unsplash decorativo en el hero.
     * **E-commerce físico / pinturas / moda / comida / viajes / inmobiliaria**: puedes usar \`https://picsum.photos/seed/…\` con semilla temática al producto (ej. \`gafcore-paint-hero-kitchen\`, \`gafcore-food-hero\`) o fotos del usuario en \`assets/…\`.
     * Si hay \`assets/nombre-exacto.jpg\` referenciado por el usuario, \`src="assets/…"\` tal cual. Prohibido \`image_3.png\` o rutas locales inventadas. Cada \`<img>\` con \`alt\` descriptivo.
   - **Layout**: pon \`alt\` útil y tamaños (\`width\`/\`height\` o contenedor \`aspect-*\` en Tailwind) para evitar saltos de layout. Evita animaciones o sombras pesadas en decenas de tarjetas a la vez.
   - **E‑commerce / catálogos**: grids simples responsive (grid + gap), pocas fuentes externas; si hay muchos productos, paginación o “mostrar 6–8” con botón, no cientos de nodos sin necesidad.
   - **Fidelidad a briefings visuales**: si el usuario pide **galería, collage, grid de N imágenes, hero de dos columnas, CTAs duales, secciones premium**, impleméntalo **literalmente** en la misma respuesta: \`grid\`/\`flex\` con \`gap\`, \`grid-cols-*\`, \`min-h-*\` o \`aspect-*\`, textos jerárquicos (h1/h2/p), botones con estilos distintos (relleno + outline) y **varias** URLs https de imagen coherentes con el tema. **No sustituyas** eso por una fila de iconitos o un bloque de texto genérico: es incumplimiento del encargo.
   - **Dirección de layout (español)**: si piden **horizontal / en fila / uno al lado del otro / iconos en horizontal debajo del nombre**, usa \`flex-row\` o \`grid-cols-*\` en ese contenedor — **nunca** \`flex-col\` ahí. Si piden **vertical / en columna / uno debajo de otro**, usa \`flex-col\`. Respeta la dirección literal aunque el código previo use lo contrario.
7) **Alcance y excelencia operativa (GafCore)**:
   - **Alcance**: “delta mínimo” significa **no tocar** rutas, auth ni carpetas que no guarden relación con el pedido; **no** significa entregar una UI pobre cuando el usuario pidió riqueza visual. Si hace falta un componente o sección grande en un solo archivo para cumplir el diseño, hazlo (sin reestructurar masivamente el repo si no se pide).
   - **Robustez**: anticipa fallos habituales (imports inexistentes, JSON mal cerrado, rutas de archivo inválidas) y evítalos en la primera respuesta.
   - **UI**: contraste legible, estados hover/focus visibles, \`aria-*\` en controles interactivos cuando aporten; formularios con \`label\` asociado a \`input\`.
   - **JSX válido**: cada atributo separado (\`htmlFor="from" className="…"\`). **Nunca** pegues URLs (\`https://…\`) dentro de un atributo ni entre comillas de otro (prohibido \`htmlFor="from"https://…\`).
   - **Brain V2**: ver \`gafcore-brain-v2\` — listas planas, pre-procesamiento antes del \`return\`, sin lógica defensiva en JSX.
   - **Iconos lucide-react**: por cada \`<Sparkles />\`, \`<Star />\`, etc. incluye \`import { Sparkles, Star } from "lucide-react"\` en el mismo archivo. Sin import = preview roto.
   - **Prohibido react-router / react-router-dom** en proyectos del IDE: el preview es una sola página. Usa \`useState\` para cambiar vistas (inicio, admin, chat). No BrowserRouter ni Routes.
   - **Salida**: el razonamiento detallado no debe aparecer fuera del campo \`reply\`; nunca texto antes o después del objeto JSON raíz.

8) **Tono y conversación (GafCore)**:
   - Eres cercano y profesional en español. Si el usuario **solo saluda** (hola, buenas, gracias), responde con calidez en \`reply\`, pregunta en qué ayudar, y \`files: []\` — **nunca** digas «no se hicieron cambios» ni un tono de error.
   - En construcción, explica en \`reply\` qué hiciste y por qué (1-3 frases útiles), no solo «listo».
   - Propón mejoras breves cuando aporte valor (UX, imagen hero, formularios funcionales).

9) **Capa de validación GafCore (antes de cerrar la respuesta)**:
   - Revisa mentalmente: sintaxis TS/JSX, imports relativos que existan en el delta o en contexto, \`export default\` en App, \`main.tsx\` + \`index.html\` si es Vite.
   - No inventes módulos \`./\` sin crear el archivo en \`files\`.
   - Si el usuario pidió build/deploy, \`package.json\` coherente con imports npm usados.
   - **Consistencia de salida**: un solo objeto JSON raíz; \`files\` con rutas relativas sin \`/\` inicial; \`content\` completo por archivo (no truncar con \`...\`).

10) **ESCUDO DE INTEGRIDAD (ediciones sucesivas — obligatorio)**:
   - Antes de editar: analiza el árbol de imports/componentes; identifica impacto en padres e hijos.
   - PROHIBIDO eliminar imports, \`import type\`, hooks (useState, useEffect, etc.) o tipos existentes salvo petición explícita de borrado.
   - Cambios INCREMENTALES: extiende código; no sustituyas el layout padre (App.tsx) si solo pidieron un componente hijo.
   - **CIERRE OBLIGATORIO**: Antes de responder, cuenta manualmente: por cada \`{\` debe haber un \`}\`. Por cada tag JSX abierto \`<Tag\` debe haber \`</Tag>\` o \`/>\`. Si no coinciden, corrige ANTES de responder. NO es aceptable enviar código con desbalances.
   - Ningún componente debe \`return undefined\`; usa \`null\` o JSX de fallback.

11) **FUNCTIONAL-FIRST (obligatorio en modo Construir — Capa 0 GafCore)**:
   - **Prioridad absoluta**: Funcionalidad > UI > estética. Nada es “solo UI”.
   - **Cada feature nueva debe incluir**: (1) UI, (2) estado React + handlers, (3) capa de datos (ver abajo), (4) manejo de error, (5) loading/éxito visible, (6) flujo de usuario cerrado.
   - **Flujo de generación** (sigue este orden mental antes de escribir archivos):
     1. Interpretar **intención funcional** (qué hace el usuario, qué datos cambian).
     2. Definir **flujo de datos** (estado, eventos, persistencia).
     3. Diseñar **capa de datos** (funciones puras + hooks; ver persistencia).
     4. Conectar **handlers** en componentes.
     5. Generar **UI ya cableada** a ese estado.
     6. Validar mentalmente el recorrido end-to-end (clic → cambio visible).
   - **Persistencia en el preview del IDE** (sin servidor propio del proyecto): usa \`useState\` + \`useEffect\` + \`localStorage\` (clave por app, p. ej. \`gafcore-cart\`) o módulo \`lib/store.ts\` / \`lib/api.ts\` con funciones \`load/save\`. Para catálogos/e-commerce: array de productos en estado, \`addToCart\`, totales calculados, mensaje de confirmación.
   - **PROHIBIDO en lib/store.ts**: nunca uses genéricos TypeScript \`<T>\` dentro de template literals ni en el cuerpo de funciones. \`saveJson\` debe ser exactamente \`localStorage.setItem(key, JSON.stringify(value))\` — sin \`</T>\` ni \`<T>\` en esa línea. Usa \`unknown\` en la firma si hace falta tipar el valor.
   - **Formularios**: siempre \`onSubmit\` con \`e.preventDefault()\`, validación mínima y feedback (\`error\`, \`success\`, \`isSubmitting\`).
   - **Botones**: siempre \`onClick\` o \`type="submit"\` dentro de form con \`onSubmit\`; prohibido \`onClick={() => {}}\`.
   - **Enlaces**: \`href\` real o \`onClick\`; prohibido \`href="#"\` sin handler.
   - **Prohibido**: endpoints inventados sin implementar; listas estáticas cuando el usuario pidió CRUD; \`TODO\`/\`FIXME\` en el camino principal; maquetas “para terminar después”.
   - **Estructura recomendada** (cuando el proyecto crece): \`lib/types.ts\`, \`lib/store.ts\` o \`hooks/useCart.ts\`, componentes en \`components/\`.
   - **Deploy**: el export Vite/React debe compilar (\`main.tsx\`, \`index.html\`, imports resueltos).

Formato de salida (obligatorio):
Responde SIEMPRE en JSON puro con esta forma exacta:
{
  "reply": "explicación breve para el usuario en español",
  "files": [ { "name": "...", "language": "...", "content": "..." } ]
}
Reglas de **archivos (eficiencia)**:
   - En "files" incluye **solo** archivos **nuevos, creados o modificados** (delta). No repitas archivos sin cambios.
   - **Preservación de estructura**: NUNCA elimines componentes/archivos existentes salvo petición explícita; reescritura incremental obligatoria.
- Si no hay cambios de código, devuelve "files": [].
- Si el usuario pide **cambiar código/UI** (fondo, hero, App.tsx, formulario, etc.), **files NO puede estar vacío**: incluye al menos el archivo modificado (p. ej. App.tsx) con el contenido completo actualizado.
- No incluyas markdown ni triple backtick. Solo JSON válido.`;

/** Créditos que consume cada ejecución de IA vía `consume_credits` (1 solicitud = 1 unidad salvo planes ilimitados). */
export const COST_PER_REQUEST = 1;

/**
 * Slugs OpenRouter — cerebro multi-proveedor (competir con Lovable/v0):
 * - Fast: Gemini Flash → chat y respuestas rápidas.
 * - Deep: GPT-4o → generación de código React/Tailwind (calidad tipo v0).
 * - UI: Gemini Pro → diseño visual, layout y auditoría estética.
 * Sobrescribibles: AI_MODEL_FAST / AI_MODEL_DEEP / AI_MODEL_UI.
 */
export const MODEL_FAST = "google/gemini-2.0-flash-001";
export const MODEL_DEEP = "openai/gpt-4o";
export const MODEL_UI = "google/gemini-2.5-pro";

/** Defaults con API nativa Anthropic (ANTHROPIC_API_KEY en Vercel). */
export const ANTHROPIC_API_DEFAULT_FAST = GAFCORE_ANTHROPIC_MODEL_DEFAULT;
export const ANTHROPIC_API_DEFAULT_DEEP = GAFCORE_ANTHROPIC_MODEL_DEFAULT;
export const ANTHROPIC_API_DEFAULT_UI = GAFCORE_ANTHROPIC_MODEL_DEFAULT;

/** IDs por defecto en API nativa OpenAI (sin OpenRouter). */
export const OPENAI_API_DEFAULT_FAST = "gpt-4o-mini";
export const OPENAI_API_DEFAULT_DEEP = "gpt-4o";
export const OPENAI_API_DEFAULT_UI = "gpt-4o";

/**
 * Elige defaults de modelo según el host del endpoint.
 * Con el router multi-proveedor (ANTHROPIC_API_KEY + OPENROUTER_API_KEY) los
 * slugs estilo OpenRouter (`anthropic/claude-sonnet-4.5`, `openai/gpt-4o-mini`)
 * son válidos en cualquier ruta: el router normaliza al formato del proveedor.
 */
export function resolveGafcoreModelDefaults(chatCompletionsUrl?: string): {
  fast: string;
  deep: string;
  ui: string;
} {
  const hasAnthropic =
    typeof process !== "undefined" && Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  if (hasAnthropic) {
    return {
      fast: process.env.AI_MODEL_FAST?.trim() || ANTHROPIC_API_DEFAULT_FAST,
      deep: process.env.AI_MODEL_DEEP?.trim() || ANTHROPIC_API_DEFAULT_DEEP,
      ui: process.env.AI_MODEL_UI?.trim() || ANTHROPIC_API_DEFAULT_UI,
    };
  }

  const u = (chatCompletionsUrl ?? "").toLowerCase();
  const isOpenAiNative =
    u.includes("api.openai.com") && !u.includes("openrouter") && !u.includes("anthropic");
  return {
    fast: isOpenAiNative ? OPENAI_API_DEFAULT_FAST : MODEL_FAST,
    deep: isOpenAiNative ? OPENAI_API_DEFAULT_DEEP : MODEL_DEEP,
    ui: isOpenAiNative ? OPENAI_API_DEFAULT_UI : MODEL_UI,
  };
}

const CONTEXT_CHAR_BUDGET = 42_000;
const PER_FILE_CONTEXT_CAP = 14_000;

export type ProjFile = { name: string; language?: string; content: string };

export { validateOutputFiles } from "@/lib/gafcore-output-files-validate.shared";

export function totalChars(files: ProjFile[]) {
  return files.reduce((s, f) => s + f.content.length, 0);
}

function truncateForContext(f: ProjFile, max: number): ProjFile {
  if (f.content.length <= max) return f;
  return {
    ...f,
    content: `${f.content.slice(0, max)}\n\n/* …contexto truncado para el modelo… */\n`,
  };
}

export function selectContextFiles(
  instruction: string,
  files: ProjFile[],
  priorityNames: string[] = [],
): ProjFile[] {
  if (totalChars(files) <= CONTEXT_CHAR_BUDGET * 0.92) {
    return files.map((f) => truncateForContext(f, PER_FILE_CONTEXT_CAP));
  }
  const inst = instruction.toLowerCase();
  const tokens = [...new Set(inst.split(/[^a-z0-9áéíóúñ_/]+/gi).filter((t) => t.length > 2))];
  const pick = new Set<string>();
  for (const name of priorityNames) {
    const n = name.replace(/\\/g, "/");
    for (const f of files) {
      if (f.name.replace(/\\/g, "/") === n) pick.add(f.name);
    }
  }
  const always = [
    "package.json",
    "tsconfig.json",
    "vite.config.ts",
    "src/styles.css",
    "bun.lock",
    "bun.lockb",
    "package-lock.json",
  ];
  for (const f of files) {
    const n = f.name.toLowerCase();
    if (always.some((a) => n === a || n.endsWith(`/${a}`))) pick.add(f.name);
  }
  for (const f of files) {
    const n = f.name.toLowerCase();
    for (const t of tokens) {
      if (t && n.includes(t)) pick.add(f.name);
    }
  }
  if (/(landing|hero|página|pagina|component|route|ruta|layout|formulario|dashboard)/i.test(inst)) {
    for (const f of files) {
      if (/routes\//i.test(f.name) || /\/routes\//i.test(f.name) || /components\//i.test(f.name)) {
        pick.add(f.name);
      }
    }
  }
  if (pick.size < 5) {
    files.slice(0, 16).forEach((f) => pick.add(f.name));
  }
  for (const f of files) {
    const n = f.name.toLowerCase();
    if (/^app\.(tsx|jsx)$/i.test(n) || /components\//i.test(n)) {
      pick.add(f.name);
    }
  }
  let out = files.filter((f) => pick.has(f.name));
  out = out.map((f) => truncateForContext(f, PER_FILE_CONTEXT_CAP));
  while (totalChars(out) > CONTEXT_CHAR_BUDGET && out.length > 6) {
    out = [...out].sort((a, b) => b.content.length - a.content.length);
    out.pop();
  }
  return out;
}

/** Modelo con visión cuando hay imágenes de referencia adjuntas. */
export function pickVisionModel(deep: string = MODEL_DEEP): string {
  const u = deep.toLowerCase();
  if (u.includes("gpt-4o")) return deep;
  if (u.includes("gemini")) return deep;
  if (u.includes("claude")) return deep;
  return MODEL_DEEP;
}

export function pickModel(
  instruction: string,
  fast: string = MODEL_FAST,
  deep: string = MODEL_DEEP,
  hasVisionImages = false,
  ui: string = MODEL_UI,
): string {
  if (hasVisionImages) return pickVisionModel(deep);
  const t = instruction.trim();
  /** Explícito en el IDE (toggle o texto): fuerza modelo profundo antes que “modo chat”. */
  if (/^\[modo profundo\]/i.test(t) || /^\[modo deep\]/i.test(t)) return deep;
  if (/^\[CONVERSACIÓN GafCore\]/i.test(t) || /^\[Modo chat\]/i.test(t)) return fast;
  if (/^\[modo chat\]/i.test(t)) return fast;
  if (/^\[CREATIVIDAD OBLIGATORIA\]/i.test(t) || isSubstantiveBuildRequest(t)) return deep;

  /** Pide calidad visual / maquetación: Gemini Pro para UI premium; GPT-4o para builds con código. */
  const wantsDeepUi =
    /p[aá]gina|landing|dise[ñn]o|dise[ñn]a|maquet|componente|ui\b|layout|hero|secci[oó]n|estilo|tailwind|css|tema|foto|im[áa]gen|im[áa]genes|imagenes|e-?commerce|tienda|venta|cat[áa]logo|navbar|footer|responsive|accesibilidad|animaci|preview|zapato|tenis|ropa|producto|galer[ií]a|collage|rejilla|mosaico|cuadr[íi]cula|bento|showcase|portafolio|portfolio|presupuesto|cotizaci[oó]n|cta\b|mockup|figma|tipograf|jerarqu[ií]a|hiperreal|fotograf|coating|pintura|fachada|edificio|comercial|residencial|premium|marca|branding|wireframe|maqueta|alta\s*calidad|resoluci|llamada\s+a\s+la\s+acci[oó]n/i.test(
      t,
    ) ||
    /\bpage\b|\bdashboard\b|\bform\b|\bshop\b|\bgallery\b|\bcarousel\b|\bmasonry\b|\bcard\b|\bhero\b|\bgrid\b|\blastings\b|\bcollage\b|\bcta\b|\bnavbar\b|\bfooter\b|\bsection\b|\blayout\b|\bhigh[-\s]?resolution\b|\bpixel\s*perfect\b/i.test(
      t,
    );

  const wantsDeepTech =
    /refactor|migraci[oó]n|migrat|architect|error|bug|despliegue|optimiza|seguridad|typescript|eslint|performance|FUNCTIONAL-FIRST|GAFCORE BUILD|files\b/i.test(
      t,
    );

  if (wantsDeepTech || instructionNeedsLayoutModel(t)) return deep;
  if (wantsDeepUi) return ui;
  if (t.length >= 420) return deep;
  if (t.length < 260) return fast;
  return deep;
}

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return h >>> 0;
}

export function projectCacheFingerprint(files: ProjFile[]): string {
  const parts = files.map((f) => {
    return `${f.name}:${f.content.length}:${djb2(f.content)}`;
  });
  parts.sort();
  return parts.join(">");
}

/** Clave de caché por usuario + proyecto + instrucción + huella del workspace. */
export function buildGafcoreChatCacheKey(input: {
  userId: string;
  model: string;
  instruction: string;
  files: ProjFile[];
  projectId?: string | null;
  brandName?: string | null;
}): string {
  const projectPart = input.projectId?.trim() ? input.projectId.trim() : "_";
  const brandPart = input.brandName?.trim() ?? "";
  return `${input.userId}:${input.model}:${instructionKey(input.instruction)}:${projectCacheFingerprint(input.files)}:${projectPart}:${brandPart}`;
}

/** No persistir respuestas vacías o bloqueadas por validación (evita cache hits silenciosos). */
export function shouldWriteGafcoreChatCache(
  files: ProjFile[],
  options?: { validationBlocked?: boolean },
): boolean {
  if (options?.validationBlocked) return false;
  return files.length > 0;
}

export function instructionKey(instr: string): string {
  const a = djb2(instr);
  const b = djb2(instr.slice(Math.max(0, instr.length - 4000)));
  return `${a.toString(16)}_${b.toString(16)}`;
}

export type CachedPayload = { reply: string; files: ProjFile[] };

const responseCache = new Map<string, { at: number; payload: CachedPayload }>();
const CACHE_TTL_MS = 55_000;
const CACHE_MAX = 64;

export function cacheGet(key: string): CachedPayload | null {
  const row = responseCache.get(key);
  if (!row) return null;
  if (Date.now() - row.at > CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }
  return row.payload;
}

export function cacheSet(key: string, payload: CachedPayload) {
  while (responseCache.size >= CACHE_MAX) {
    const first = responseCache.keys().next().value;
    if (first === undefined) break;
    responseCache.delete(first);
  }
  responseCache.set(key, { at: Date.now(), payload });
}

export async function fetchBalance(userId: string): Promise<number | null> {
  const { data, error } = await supabaseAdmin
    .from("user_credits")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return null;
  return typeof data?.balance === "number" ? data.balance : null;
}

export function buildGafcoreMessages(
  data: GafcoreChatBody,
  resolvedModel?: string,
  memoryHints = "",
  priorityPaths: string[] = [],
  brandBlock = "",
): {
  messages: GafcoreChatMessage[];
  model: string;
  subset: boolean;
  ctxFiles: ProjFile[];
} {
  const allFiles = data.files as ProjFile[];
  const incremental = prepareIncrementalEditSession(allFiles, data.instruction);
  const mergedPriority = [...new Set([...priorityPaths, ...incremental.priorityPaths])];
  const incrementalNote = incremental.active
    ? `${incremental.promptAppend}${buildIntegrityShieldPromptAppend(allFiles, data.instruction)}`
    : GAFCORE_INTEGRITY_SHIELD_RULE;
  const visionImages = extractVisionImageParts(allFiles);
  const hasVision = visionImages.length > 0;
  const model =
    resolvedModel ?? pickModel(data.instruction, MODEL_FAST, MODEL_DEEP, hasVision);
  const ctxFiles = selectContextFiles(data.instruction, allFiles, mergedPriority);
  const subset =
    ctxFiles.length < allFiles.length ||
    totalChars(ctxFiles) < totalChars(allFiles) * 0.88;
  const subsetNote = subset
    ? '\n\n(Nota interna: solo se listan archivos de contexto seleccionados por tamaño/relevancia. Devuelve en "files" únicamente deltas: archivos nuevos o modificados.)'
    : "";
  const filesContext = JSON.stringify(filesContextForModel(ctxFiles));
  const textBlock = `Archivos de contexto:\n${filesContext}\n\nInstrucción:\n${data.instruction}${subsetNote}`;

  const userContent: GafcoreChatMessage["content"] =
    hasVision && visionImages.length > 0
      ? [
          { type: "text", text: textBlock },
          ...visionImages.map((img) => ({
            type: "image_url" as const,
            image_url: { url: img.url },
          })),
        ]
      : textBlock;

  const v2Only = isGafcoreBrainV2Only();
  let legacyAppend: string;
  if (v2Only) {
    const inferredTask = inferAiBrainTaskFromInstruction(data.instruction);
    const designMotor = buildDesignMotorPromptAppend(inferredTask, data.instruction);
    const designLayer = designMotor ? "" : GAFCORE_DESIGN_SYSTEM;
    legacyAppend = [
      buildAgentProjectContext(ctxFiles),
      designLayer,
      designMotor,
      buildAgentModeAppend(data.instruction),
      brandBlock,
      incrementalNote,
      memoryHints,
    ]
      .filter(Boolean)
      .join("\n\n");
  } else {
    const useFullPrompts =
      typeof process !== "undefined" &&
      process.env?.GAFCORE_FULL_PROMPTS === "1";
    const coreSystem = useFullPrompts ? GAFCORE_SYSTEM : GAFCORE_SYSTEM_CONDENSED;
    const inferredTask = inferAiBrainTaskFromInstruction(data.instruction);
    const designMotor = buildDesignMotorPromptAppend(inferredTask, data.instruction);
    const designLayer = designMotor
      ? ""
      : useFullPrompts
        ? GAFCORE_DESIGN_SYSTEM
        : GAFCORE_DESIGN_CONDENSED;
    const safeBuildHint =
      isSubstantiveBuildRequest(data.instruction) && designMotor
        ? "\n[SAFE-BUILD] Validación automática post-generación.\n"
        : "";
    legacyAppend = `${coreSystem}${designLayer}${designMotor}${safeBuildHint}${brandBlock}${incrementalNote}${memoryHints}`;
  }
  const systemContent = buildGafcoreBrainV2SystemContent({
    legacyAppend,
    model,
  });

  const messages: GafcoreChatMessage[] = [
    { role: "system", content: systemContent },
    ...data.history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: userContent },
  ];
  return { messages, model, subset, ctxFiles };
}
