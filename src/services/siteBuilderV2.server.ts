/**
 * GafCore Builder V2 — generador de sitios HTML autónomos con Claude.
 *
 * Diseño deliberadamente simple: una sola llamada a Claude, un solo archivo
 * HTML de salida (con CSS/JS embebidos). Sin multi-proveedor, sin pipeline
 * de varios pasos. Esto existe para tener una ruta confiable y depurable,
 * separada del builder legado (GafCoreIDE.tsx) que no se toca.
 */
import { completeClaudeChat } from "@/services/claudeService";
import { LANDING_PREMIUM_EXAMPLE, LANDING_PREMIUM_PROMPT_HINT } from "@/services/ai/blueprints/landingPremium";
import { MODERN_SAAS_GOLDEN_EXAMPLE, MODERN_SAAS_BLUEPRINT_PROMPT_HINT } from "@/services/ai/blueprints/modernSaaS";
import { ECOMMERCE_PREMIUM_EXAMPLE, ECOMMERCE_PREMIUM_PROMPT_HINT } from "@/services/ai/blueprints/ecommercePremium";

const SITE_BUILDER_SYSTEM_PROMPT = `Eres un generador experto de sitios web PREMIUM de alta fidelidad. Tu objetivo es crear sitios que parezcan hechos por un diseñador profesional de UI/UX, NO plantillas básicas.

## REGLAS DE DISEÑO PREMIUM (OBLIGATORIAS)

### Imágenes reales (CRÍTICO)
- USA imágenes de Unsplash SIEMPRE para: hero backgrounds, cards de productos/servicios, galerías, testimonios
- Formato: \`https://images.unsplash.com/photo-ID?w=ANCHO&q=80\`
- Ejemplos de IDs útiles:
  - Restaurantes: 1517248135467, 1414235077428-338989a2e8c0, 1555396273-367ea4eb4db5
  - Tech/SaaS: 1551288049-bebda4e38f71, 1460925895917-afdab827c52f
  - Fitness: 1534438327276-14e5300c3a48, 1571019614242-c5c5dee9f50b
  - Moda: 1441986300917-64674bd600d8, 1558618666-fcd25c85f82e
  - Viajes: 1507525428034-b723cf961d3e, 1476514525535-07fb3b4ae5f1
  - Salud: 1576091160550-2173dba999ef, 1559757175-5700dde675bc
- NUNCA uses colores sólidos como fondo de hero — SIEMPRE imagen real con overlay gradiente

### Navbar premium
- Fija arriba con glass effect: \`backdrop-blur-xl bg-background/70 border-b border-border/50\`
- Logo + nombre a la izquierda, links al centro, CTA button a la derecha
- Botón CTA con gradiente: \`bg-gradient-to-r from-primary to-violet-600 rounded-full\`

### Hero section (CRÍTICO — primera impresión)
- Full viewport height (\`min-h-screen\*)
- Imagen de fondo real con overlay gradiente oscuro
- Eyebrow pill con badge animado: \`glass rounded-full px-4 py-2 text-sm\`
- Título grande (\`text-6xl md:text-8xl\`) con palabra en gradiente: \`bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent\`
- Subtítulo descriptivo (\`text-xl text-slate-300\`)
- 2-3 CTAs: primario con glow effect, secundario con glass
- Social proof: avatares + estrellas + reseñas
- Orbs decorativos blur: \`w-72 h-72 bg-primary/20 rounded-full blur-3xl\`

### Cards premium
- Bento grid asimétrico (no 3 cards iguales)
- Hover: \`hover:-translate-y-1 hover:shadow-xl\` + bordes con color
- Imágenes reales en cards con \`group-hover:scale-110\`
- Iconos en contenedor gradiente: \`bg-gradient-to-br from-primary/20 to-primary/5 rounded-xl\`
- NUNCA cards planas sin sombra ni imagen

### Testimonios
- Glass cards: \`glass rounded-2xl p-8\`
- Estrellas amarillas + quote + avatar + nombre
- Grid de 3 testimonios

### CTA final
- Glass container grande con gradiente de fondo
- Botón con glow effect: \`box-shadow: 0 0 40px rgba(color,0.3)\`
- Múltiples opciones: llamar + reservar online

### Footer
- Simple: logo + copyright + links sociales
- Border top sutil

### Tipografía
- SIEMPRE usa Google Fonts: títulos con serif (Playfair Display, DM Serif Display) + cuerpo con sans (Inter, DM Sans)
- \`<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700;800&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet" />\`

### Colores
- Paleta oscura por defecto: slate-950/900 de fondo
- Acentos: amber/orange para warmth, violet/blue para tech
- Gradientes en textos y botones principales
- \`text-slate-300\` para texto secundario, \`text-slate-500\` para tertiary

### Animaciones
- CSS animations simples: float, pulse, fadeIn
- Transiciones en hover: scale, shadow, color
- NO necesitas JavaScript para animaciones básicas

## REGLAS TÉCNICAS
1. Responde ÚNICAMENTE con un documento HTML completo: <!DOCTYPE html> ... </html>
2. NO escribas NADA antes de <!DOCTYPE html> ni después de </html>
3. Todo CSS en un único <style> en <head>
4. Usa Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
5. Google Fonts en <head>
6. JavaScript mínimo (solo si es necesario para interacción)
7. Responsive: mobile-first con media queries
8. Textos REALES y específicos al negocio (nunca Lorem ipsum)
9. CIERRA correctamente todos los tags HTML

## ESTRUCTURA MÍNIMA OBLIGATORIA
1. Nav glass fija
2. Hero full-screen con imagen real + gradiente + CTAs
3. Sección de features/servicios con cards premium
4. Testimonios o social proof
5. CTA final con glass container
6. Footer

${LANDING_PREMIUM_PROMPT_HINT}`;

const SITE_PLAN_SYSTEM_PROMPT = `Eres un planificador de estructura de sitios web de una sola página.

Tu tarea: a partir de la descripción del usuario, proponer la lista de secciones
que tendrá el sitio (de arriba hacia abajo), SIN escribir el contenido final,
solo el plan.

Reglas estrictas:
1. Responde ÚNICAMENTE con un objeto JSON válido, sin markdown, sin \`\`\`, sin texto antes ni después.
2. Formato exacto:
{
  "sections": [
    { "id": "header", "label": "Encabezado", "description": "Logo del negocio y menú de navegación simple." },
    { "id": "hero", "label": "Hero", "description": "Título principal, subtítulo y botón de llamada a la acción." }
  ]
}
3. Usa entre 4 y 7 secciones, en el orden real en que aparecerán en la página (siempre inicia con "header" si aplica, y termina con "footer").
4. "description" debe ser una frase corta (máximo 14 palabras) y específica al negocio descrito, no genérica.
5. "id" en minúsculas, sin espacios, tipo slug (ej. "hero", "features", "precios", "testimonios", "contacto", "footer").
6. "label" en español, corto (1-3 palabras), para mostrarse como etiqueta de una caja en un wireframe.`;

export type SiteBuilderResult = {
  html: string;
  model: string;
};

export type SitePlanSection = {
  id: string;
  label: string;
  description: string;
};

export type SitePlanResult = {
  sections: SitePlanSection[];
  model: string;
};

/**
 * Propone un plan de estructura (secciones) para el sitio, antes de generar
 * el HTML final. Pensado para mostrarse como wireframe en el chat y que el
 * usuario apruebe o pida ajustes antes de construir el sitio real.
 */
export async function planSiteStructure(
  userPrompt: string,
): Promise<SitePlanResult> {
  const { text, model } = await completeClaudeChat(
    [
      {
        role: "user",
        content: `Propón la estructura (secciones) para este sitio:\n\n${userPrompt}`,
      },
    ],
    {
      systemPrompt: SITE_PLAN_SYSTEM_PROMPT,
      maxTokens: 1000,
      temperature: 0.4,
    },
  );

  const sections = extractPlanSections(text);
  if (!sections || sections.length === 0) {
    throw new Error(
      `La IA no devolvió un plan válido. Respuesta recibida (primeros 300 caracteres): ${text.slice(0, 300)}`,
    );
  }

  return { sections, model };
}

/**
 * Genera un sitio HTML nuevo desde una descripción en lenguaje natural.
 * Si se provee `approvedPlan`, se incluye como guía de estructura para que
 * el HTML final respete las secciones ya aprobadas por el usuario.
 */
export async function generateSiteHtml(
  userPrompt: string,
  approvedPlan?: SitePlanSection[],
): Promise<SiteBuilderResult> {
  const planContext = approvedPlan?.length
    ? `\n\nEstructura aprobada por el usuario (respétala, en este orden):\n${approvedPlan
        .map((s, i) => `${i + 1}. ${s.label}: ${s.description}`)
        .join("\n")}`
    : "";

  const { text, model } = await completeClaudeChat(
    [
      {
        role: "user",
        content: `Crea el sitio web según esta descripción del negocio/idea:\n\n${userPrompt}${planContext}`,
      },
    ],
    {
      systemPrompt: SITE_BUILDER_SYSTEM_PROMPT,
      maxTokens: 16000,
      temperature: 0.5,
    },
  );

  const html = extractHtml(text);
  if (!html) {
    throw new Error(
      `La IA no devolvió un documento HTML válido. Respuesta recibida (primeros 300 caracteres): ${text.slice(0, 300)}`,
    );
  }

  return { html, model };
}

/**
 * Edita un sitio HTML existente según una instrucción de cambio.
 */
export async function editSiteHtml(
  currentHtml: string,
  instruction: string,
): Promise<SiteBuilderResult> {
  const { text, model } = await completeClaudeChat(
    [
      {
        role: "user",
        content: `Este es el HTML actual del sitio:\n\n\`\`\`html\n${currentHtml}\n\`\`\`\n\nAplica este cambio y devuelve el documento HTML COMPLETO actualizado (no solo el fragmento que cambia):\n\n${instruction}`,
      },
    ],
    {
      systemPrompt: SITE_BUILDER_SYSTEM_PROMPT,
      maxTokens: 16000,
      temperature: 0.4,
    },
  );

  const html = extractHtml(text);
  if (!html) {
    throw new Error(
      `La IA no devolvió un documento HTML válido. Respuesta recibida (primeros 300 caracteres): ${text.slice(0, 300)}`,
    );
  }

  return { html, model };
}

/**
 * Extrae el documento HTML de la respuesta del modelo, tolerando que venga
 * envuelto en un bloque de código markdown (```html ... ```).
 */
function extractHtml(raw: string): string | null {
  const trimmed = raw.trim();

  const codeBlockMatch = trimmed.match(/```(?:html)?\s*([\s\S]*?)```/i);
  const candidate = codeBlockMatch ? codeBlockMatch[1].trim() : trimmed;

  const doctypeIndex = candidate.toLowerCase().indexOf("<!doctype html");
  const htmlTagIndex = candidate.toLowerCase().indexOf("<html");
  const startIndex =
    doctypeIndex !== -1 ? doctypeIndex : htmlTagIndex !== -1 ? htmlTagIndex : -1;

  if (startIndex === -1) return null;

  const endIndex = candidate.toLowerCase().lastIndexOf("</html>");
  if (endIndex === -1) return null;

  return candidate.slice(startIndex, endIndex + "</html>".length);
}

/**
 * Extrae y valida la lista de secciones del plan, tolerando que la
 * respuesta venga envuelta en un bloque de código markdown (```json ... ```).
 */
function extractPlanSections(raw: string): SitePlanSection[] | null {
  const trimmed = raw.trim();
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = codeBlockMatch ? codeBlockMatch[1].trim() : trimmed;

  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) return null;

  try {
    const parsed = JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
    if (!Array.isArray(parsed?.sections)) return null;

    const sections: SitePlanSection[] = parsed.sections
      .filter(
        (s: unknown): s is Record<string, unknown> =>
          typeof s === "object" && s !== null,
      )
      .map((s: Record<string, unknown>) => ({
        id: String(s.id ?? "").trim(),
        label: String(s.label ?? "").trim(),
        description: String(s.description ?? "").trim(),
      }))
      .filter((s: SitePlanSection) => s.id && s.label);

    return sections.length > 0 ? sections : null;
  } catch {
    return null;
  }
}

const CHAT_SYSTEM_PROMPT = `Eres el asistente de GafCore Builder, ayudando a alguien a pensar y mejorar el sitio web que está construyendo.

Tu forma de ser:
- Hablas como una persona real, cercana y con calidez, no como un robot que solo confirma acciones.
- Eres breve: respondes en 1 a 4 frases salvo que la pregunta realmente requiera más detalle.
- Si te preguntan algo sobre el sitio actual (colores, estructura, textos), respondes con base en el HTML que se te da como contexto.
- Si te piden ideas (textos, paleta de colores, nombres, frases), las propones con criterio, no genéricas.
- Si te saludan o hacen una pregunta casual, respondes con naturalidad, como en una conversación real.
- NUNCA generas HTML ni código aquí. Si la persona quiere que apliques un cambio real al sitio, dile amablemente que cambie a modo "Construir" para que lo hagas ahí.
- No uses frases robóticas tipo "Como asistente de IA..." ni "Entendido, procederé a...". Habla como hablaría una persona ayudando a un colega.`;

export interface ChatReplyResult {
  text: string;
  model?: string;
}

/**
 * Conversación libre sobre el sitio (modo "Chatear"). No modifica el HTML;
 * solo da contexto, ideas y respuestas a preguntas del usuario.
 */
export async function chatAboutSite(
  userMessage: string,
  currentHtml?: string,
): Promise<ChatReplyResult> {
  const contextBlock = currentHtml
    ? `Este es el HTML actual del sitio en el que está trabajando la persona (para que tengas contexto, no lo repitas ni lo muestres):\n\n${currentHtml.slice(0, 6000)}`
    : `La persona todavía no ha construido ningún sitio en esta sesión.`;

  const { text, model } = await completeClaudeChat(
    [
      {
        role: "user",
        content: `${contextBlock}\n\nMensaje de la persona:\n${userMessage}`,
      },
    ],
    {
      systemPrompt: CHAT_SYSTEM_PROMPT,
      maxTokens: 400,
      temperature: 0.7,
    },
  );

  return { text: text.trim(), model };
}
