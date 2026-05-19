import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  extractVisionImageParts,
  filesContextForModel,
  type GafcoreChatMessage,
} from "@/lib/gafcore-media.shared";
import { instructionNeedsLayoutModel } from "@/lib/gafcore-layout-instruction.shared";
import { isSubstantiveBuildRequest } from "@/lib/gafcore-chat-intent.shared";

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
   - **Imágenes (obligatorio en landings)**: usa estas URLs fiables tal cual (Picsum por seed): hero \`https://picsum.photos/seed/gafcore-paint-hero-kitchen/1280/720\`; productos \`gafcore-paint-product-1\` … \`gafcore-paint-product-5\` en \`https://picsum.photos/seed/gafcore-paint-product-N/600/600\`. Si hay \`assets/…\` con referencia del usuario, \`src="assets/nombre-exacto.jpg"\`. Prohibido \`image_3.png\`, rutas locales inventadas o Unsplash sin URL verificable. Cada \`<img>\` con \`alt\` corto.
   - **Layout**: pon \`alt\` útil y tamaños (\`width\`/\`height\` o contenedor \`aspect-*\` en Tailwind) para evitar saltos de layout. Evita animaciones o sombras pesadas en decenas de tarjetas a la vez.
   - **E‑commerce / catálogos**: grids simples responsive (grid + gap), pocas fuentes externas; si hay muchos productos, paginación o “mostrar 6–8” con botón, no cientos de nodos sin necesidad.
   - **Fidelidad a briefings visuales**: si el usuario pide **galería, collage, grid de N imágenes, hero de dos columnas, CTAs duales, secciones premium**, impleméntalo **literalmente** en la misma respuesta: \`grid\`/\`flex\` con \`gap\`, \`grid-cols-*\`, \`min-h-*\` o \`aspect-*\`, textos jerárquicos (h1/h2/p), botones con estilos distintos (relleno + outline) y **varias** URLs https de imagen coherentes con el tema. **No sustituyas** eso por una fila de iconitos o un bloque de texto genérico: es incumplimiento del encargo.
   - **Dirección de layout (español)**: si piden **horizontal / en fila / uno al lado del otro / iconos en horizontal debajo del nombre**, usa \`flex-row\` o \`grid-cols-*\` en ese contenedor — **nunca** \`flex-col\` ahí. Si piden **vertical / en columna / uno debajo de otro**, usa \`flex-col\`. Respeta la dirección literal aunque el código previo use lo contrario.
7) **Alcance y excelencia operativa (GafCore)**:
   - **Alcance**: “delta mínimo” significa **no tocar** rutas, auth ni carpetas que no guarden relación con el pedido; **no** significa entregar una UI pobre cuando el usuario pidió riqueza visual. Si hace falta un componente o sección grande en un solo archivo para cumplir el diseño, hazlo (sin reestructurar masivamente el repo si no se pide).
   - **Robustez**: anticipa fallos habituales (imports inexistentes, JSON mal cerrado, rutas de archivo inválidas) y evítalos en la primera respuesta.
   - **UI**: contraste legible, estados hover/focus visibles, \`aria-*\` en controles interactivos cuando aporten; formularios con \`label\` asociado a \`input\`.
   - **JSX válido**: cada atributo separado (\`htmlFor="from" className="…"\`). **Nunca** pegues URLs (\`https://…\`) dentro de un atributo ni entre comillas de otro (prohibido \`htmlFor="from"https://…\`).
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

10) **FUNCTIONAL-FIRST (obligatorio en modo Construir — Capa 0 GafCore)**:
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
- Si no hay cambios de código, devuelve "files": [].
- No incluyas markdown ni triple backtick. Solo JSON válido.`;

/** Créditos que consume cada ejecución de IA vía `consume_credits` (1 solicitud = 1 unidad salvo planes ilimitados). */
export const COST_PER_REQUEST = 1;

/** Slugs compatibles con OpenRouter (o otro gateway OpenAI-compatible). */
export const MODEL_FAST = "google/gemini-2.5-flash";
export const MODEL_DEEP = "openai/gpt-4o";

/** IDs por defecto en `https://api.openai.com/v1/chat/completions` (no slugs `proveedor/modelo`). */
export const OPENAI_API_DEFAULT_FAST = "gpt-4o-mini";
export const OPENAI_API_DEFAULT_DEEP = "gpt-4o";

/** Elige defaults de modelo según el host del endpoint (OpenAI directo vs OpenRouter u otro). */
export function resolveGafcoreModelDefaults(chatCompletionsUrl: string): {
  fast: string;
  deep: string;
} {
  const u = chatCompletionsUrl.toLowerCase();
  const useOpenAiNativeIds = u.includes("api.openai.com") && !u.includes("openrouter");
  return {
    fast: useOpenAiNativeIds ? OPENAI_API_DEFAULT_FAST : MODEL_FAST,
    deep: useOpenAiNativeIds ? OPENAI_API_DEFAULT_DEEP : MODEL_DEEP,
  };
}

const CONTEXT_CHAR_BUDGET = 42_000;
const PER_FILE_CONTEXT_CAP = 14_000;

export type ProjFile = { name: string; language?: string; content: string };

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

export function selectContextFiles(instruction: string, files: ProjFile[]): ProjFile[] {
  if (totalChars(files) <= CONTEXT_CHAR_BUDGET * 0.92) {
    return files.map((f) => truncateForContext(f, PER_FILE_CONTEXT_CAP));
  }
  const inst = instruction.toLowerCase();
  const tokens = [...new Set(inst.split(/[^a-z0-9áéíóúñ_/]+/gi).filter((t) => t.length > 2))];
  const pick = new Set<string>();
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
): string {
  if (hasVisionImages) return pickVisionModel(deep);
  const t = instruction.trim();
  /** Explícito en el IDE (toggle o texto): fuerza modelo profundo antes que “modo chat”. */
  if (/^\[modo profundo\]/i.test(t) || /^\[modo deep\]/i.test(t)) return deep;
  if (/^\[CONVERSACIÓN GafCore\]/i.test(t) || /^\[Modo chat\]/i.test(t)) return fast;
  if (/^\[modo chat\]/i.test(t)) return fast;
  if (/^\[CREATIVIDAD OBLIGATORIA\]/i.test(t) || isSubstantiveBuildRequest(t)) return deep;

  /** Pide calidad visual / maquetación: el modelo “fast” suele dejar UI pobre o URLs de imagen inválidas en el preview del IDE. */
  const wantsDeepUi =
    /p[aá]gina|landing|dise[ñn]o|dise[ñn]a|maquet|componente|ui\b|layout|hero|secci[oó]n|estilo|tailwind|css|tema|foto|im[áa]gen|im[áa]genes|imagenes|e-?commerce|tienda|venta|cat[áa]logo|navbar|footer|responsive|accesibilidad|animaci|preview|zapato|tenis|ropa|producto|galer[ií]a|collage|rejilla|mosaico|cuadr[íi]cula|bento|showcase|portafolio|portfolio|presupuesto|cotizaci[oó]n|cta\b|mockup|figma|tipograf|jerarqu[ií]a|hiperreal|fotograf|coating|pintura|fachada|edificio|comercial|residencial|premium|marca|branding|wireframe|maqueta|alta\s*calidad|resoluci|llamada\s+a\s+la\s+acci[oó]n/i.test(
      t,
    ) ||
    /\bpage\b|\bdashboard\b|\bform\b|\bshop\b|\bgallery\b|\bcarousel\b|\bmasonry\b|\bcard\b|\bhero\b|\bgrid\b|\blastings\b|\bcollage\b|\bcta\b|\bnavbar\b|\bfooter\b|\bsection\b|\blayout\b|\bhigh[-\s]?resolution\b|\bpixel\s*perfect\b/i.test(
      t,
    );

  const wantsDeepTech =
    /refactor|migraci[oó]n|migrat|architect|error|bug|despliegue|optimiza|seguridad|typescript|eslint|performance/i.test(
      t,
    );

  if (wantsDeepUi || wantsDeepTech || instructionNeedsLayoutModel(t)) return deep;
  if (t.length >= 420) return deep;
  if (t.length < 260) return fast;
  return deep;
}

const SAFE_PATH = /^[a-zA-Z0-9_\-. /]+$/;
const MAX_FILE_OUT = 450_000;

export function validateOutputFiles(raw: unknown): ProjFile[] {
  if (!Array.isArray(raw)) return [];
  const out: ProjFile[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const name = (row as ProjFile).name;
    const content = (row as ProjFile).content;
    const language = (row as ProjFile).language;
    if (typeof name !== "string" || name.length === 0 || name.length > 512) continue;
    if (name.includes("..") || !SAFE_PATH.test(name) || name.startsWith("/")) continue;
    if (typeof content !== "string") continue;
    if (content.length > MAX_FILE_OUT) continue;
    out.push({
      name,
      language: typeof language === "string" ? language : undefined,
      content,
    });
  }
  return out;
}

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return h >>> 0;
}

export function projectCacheFingerprint(files: ProjFile[]): string {
  const parts = files.map((f) => {
    const head = f.content.slice(0, 600);
    return `${f.name}:${f.content.length}:${djb2(head)}`;
  });
  parts.sort();
  return parts.join(">");
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
): {
  messages: GafcoreChatMessage[];
  model: string;
  subset: boolean;
  ctxFiles: ProjFile[];
} {
  const allFiles = data.files as ProjFile[];
  const visionImages = extractVisionImageParts(allFiles);
  const hasVision = visionImages.length > 0;
  const model =
    resolvedModel ?? pickModel(data.instruction, MODEL_FAST, MODEL_DEEP, hasVision);
  const ctxFiles = selectContextFiles(data.instruction, allFiles);
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

  const systemContent = memoryHints.trim()
    ? `${GAFCORE_SYSTEM}${memoryHints}`
    : GAFCORE_SYSTEM;

  const messages: GafcoreChatMessage[] = [
    { role: "system", content: systemContent },
    ...data.history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: userContent },
  ];
  return { messages, model, subset, ctxFiles };
}
