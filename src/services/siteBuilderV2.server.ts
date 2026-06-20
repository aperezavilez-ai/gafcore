/**
 * GafCore Builder V2 — generador de sitios HTML autónomos con Claude.
 *
 * Diseño deliberadamente simple: una sola llamada a Claude, un solo archivo
 * HTML de salida (con CSS/JS embebidos). Sin multi-proveedor, sin pipeline
 * de varios pasos. Esto existe para tener una ruta confiable y depurable,
 * separada del builder legado (GafCoreIDE.tsx) que no se toca.
 */
import { completeClaudeChat } from "@/services/claudeService";

const SITE_BUILDER_SYSTEM_PROMPT = `Eres un generador experto de sitios web de una sola página (landing pages).

Reglas estrictas:
1. Responde ÚNICAMENTE con un documento HTML completo y autónomo: <!DOCTYPE html> ... </html>.
2. NO escribas NADA antes de <!DOCTYPE html> ni nada después de </html>. Sin saludos, sin explicaciones, sin markdown, sin \`\`\`.
3. Todo el CSS va dentro de un único <style> en el <head>. Todo el JavaScript (si se necesita) va dentro de un único <script> antes de </body>.
4. Mantén el CSS conciso y eficiente (evita repetir reglas, usa clases reutilizables) para no desperdiciar espacio de respuesta.
5. No uses frameworks externos, no uses imports, no uses CDNs que requieran red (puedes usar fuentes de sistema y emojis/SVG inline si hace falta un ícono).
6. El sitio debe ser real y funcional: textos completos y específicos al negocio descrito (no "Lorem ipsum", no placeholders tipo "[nombre aquí]").
7. Diseño moderno, responsive (usa flexbox/grid, media queries), con buen contraste de color y tipografía legible.
8. Incluye como mínimo: sección hero con título y llamada a la acción, sección de servicios/beneficios, sección de contacto (formulario simple, sin backend real, solo visual), y footer.
9. Es crítico que termines el documento completo, cerrando correctamente </body></html>. Si el contenido es extenso, prioriza terminar el documento sobre añadir más secciones.`;

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
