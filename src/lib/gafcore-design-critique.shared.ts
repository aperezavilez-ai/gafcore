/**
 * Crítica visual del cerebro GafCore — schema, heurísticas estáticas y prompt builder.
 *
 * El flujo:
 *  1. Cliente captura screenshot del preview (html2canvas) y junta el código del proyecto.
 *  2. POST /api/gafcore/design-critique con { files, screenshotDataUrl?, projectId? }.
 *  3. Backend ejecuta heurísticas locales rápidas + llamada a Claude Sonnet 4.5 (con visión si hay captura).
 *  4. Devuelve issues estructurados y un patch sugerido aplicable al chat existente.
 */
import { z } from "zod";

export const designIssueSeveritySchema = z.enum(["info", "warning", "blocker"]);
export type DesignIssueSeverity = z.infer<typeof designIssueSeveritySchema>;

export const designIssueCategorySchema = z.enum([
  "typography",
  "spacing",
  "color",
  "contrast",
  "hierarchy",
  "states",
  "responsive",
  "accessibility",
  "imagery",
  "consistency",
  "microcopy",
  "performance",
  "other",
]);
export type DesignIssueCategory = z.infer<typeof designIssueCategorySchema>;

export const designIssueSchema = z.object({
  id: z.string().min(1).max(80),
  category: designIssueCategorySchema,
  severity: designIssueSeveritySchema,
  title: z.string().min(1).max(200),
  detail: z.string().min(1).max(600),
  suggestion: z.string().min(1).max(600),
  file: z.string().max(200).optional(),
});

export const designCritiqueResponseSchema = z.object({
  summary: z.string().min(1).max(600),
  score: z.number().int().min(0).max(100),
  issues: z.array(designIssueSchema).max(40),
  followupInstruction: z.string().min(1).max(2000),
});

export type DesignIssue = z.infer<typeof designIssueSchema>;
export type DesignCritiqueResponse = z.infer<typeof designCritiqueResponseSchema>;

export type ProjFileLike = { name: string; content: string; language?: string };

/**
 * Heurísticas estáticas (no consumen IA). Se usan para:
 *  - Sembrar el prompt del cerebro con problemas obvios.
 *  - Garantizar feedback inmediato aunque la IA falle.
 */
export function runStaticHeuristics(files: ProjFileLike[]): DesignIssue[] {
  const issues: DesignIssue[] = [];

  const allCode = files
    .filter((f) => /\.(tsx?|jsx?|html?|css|scss)$/i.test(f.name))
    .map((f) => ({ name: f.name, content: f.content }));

  const hardCodedColors = /\b(bg|text|border|ring|from|to|via)-(white|black|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-(50|100|200|300|400|500|600|700|800|900|950)\b/g;
  const inlineStyleColor = /style=\{?\{?["']?[^"'}]*color:\s*(#[0-9a-f]{3,8}|rgb|hsl)/gi;

  for (const f of allCode) {
    const matches = f.content.match(hardCodedColors);
    if (matches && matches.length > 6) {
      issues.push({
        id: `hardcoded-colors-${f.name}`,
        category: "color",
        severity: "warning",
        title: `${matches.length} usos de colores hard-coded en ${f.name}`,
        detail: `Detectados tokens Tailwind nominales (\`${matches.slice(0, 3).join("`, `")}\` …). Rompen el sistema de marca cuando se cambian estilos globales.`,
        suggestion:
          "Reemplaza por tokens semánticos del proyecto: `bg-background`, `text-foreground`, `bg-primary`, `text-muted-foreground`, `border-border`, etc. Si faltan tokens, defínelos en `styles.css` con oklch.",
        file: f.name,
      });
    }
    if (inlineStyleColor.test(f.content)) {
      issues.push({
        id: `inline-color-${f.name}`,
        category: "color",
        severity: "warning",
        title: `Color en \`style\` inline en ${f.name}`,
        detail: "Los colores inline saltan el sistema de tema y oscurecen el dark mode futuro.",
        suggestion: "Usa clases Tailwind con tokens semánticos en lugar de `style={{ color: '#...' }}`.",
        file: f.name,
      });
    }
  }

  for (const f of allCode) {
    if (!/\.(tsx?|jsx?|html?)$/i.test(f.name)) continue;
    const imgs = f.content.match(/<img[^>]*>/gi) ?? [];
    for (const tag of imgs) {
      if (!/\salt\s*=/.test(tag)) {
        issues.push({
          id: `img-no-alt-${f.name}-${imgs.indexOf(tag)}`,
          category: "accessibility",
          severity: "warning",
          title: `<img> sin alt en ${f.name}`,
          detail: "Cada imagen necesita `alt` (descriptivo si es informativa, vacío si es decorativa).",
          suggestion: "Añade `alt=\"…\"` con texto corto que describa la función de la imagen.",
          file: f.name,
        });
        break;
      }
    }
  }

  for (const f of allCode) {
    if (!/\.(tsx?|jsx?|html?)$/i.test(f.name)) continue;
    const labelsCount = (f.content.match(/<label\b/gi) ?? []).length;
    const inputsCount = (f.content.match(/<(input|textarea|select)\b/gi) ?? []).length;
    if (inputsCount >= 2 && labelsCount === 0) {
      issues.push({
        id: `inputs-no-label-${f.name}`,
        category: "accessibility",
        severity: "warning",
        title: `${inputsCount} inputs sin <label> en ${f.name}`,
        detail: "Placeholder no sustituye a un label real. Rompe accesibilidad y autofill.",
        suggestion: "Envuelve cada control con `<label htmlFor=\"id\">Texto</label>` + `<input id=\"id\" …>`.",
        file: f.name,
      });
    }
  }

  for (const f of allCode) {
    if (!/\.(tsx?|jsx?)$/i.test(f.name)) continue;
    if (/onClick=\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/.test(f.content)) {
      issues.push({
        id: `empty-onclick-${f.name}`,
        category: "states",
        severity: "blocker",
        title: `onClick vacío en ${f.name}`,
        detail: "Botones sin handler real rompen la promesa funcional-first del cerebro GafCore.",
        suggestion: "Implementa el handler: navegar, mutar estado, llamar API o quitar el botón.",
        file: f.name,
      });
    }
    if (/href=["']#["']/.test(f.content)) {
      issues.push({
        id: `dead-href-${f.name}`,
        category: "states",
        severity: "warning",
        title: `<a href=\"#\"> dead-link en ${f.name}`,
        detail: "Enlaces a `#` no navegan a ninguna parte y rompen la experiencia.",
        suggestion: "Usa una ruta real con `<Link to=\"/…\">` o un botón con `onClick`.",
        file: f.name,
      });
    }
  }

  return issues;
}

/** Construye el system prompt para Claude visión (modo crítica). */
export function buildCritiqueSystemPrompt(): string {
  return `Eres un **director de diseño senior** de GafCore. Auditas una landing/app y devuelves JSON estricto.

Tu salida DEBE ser JSON puro:
{
  "summary": "1-3 frases con el diagnóstico general",
  "score": 0-100,
  "issues": [
    {
      "id": "kebab-case-unico",
      "category": "typography|spacing|color|contrast|hierarchy|states|responsive|accessibility|imagery|consistency|microcopy|performance|other",
      "severity": "info|warning|blocker",
      "title": "Una línea",
      "detail": "Por qué afecta al diseño/usuario (1-3 frases concretas).",
      "suggestion": "Acción específica (clases Tailwind, tokens, mejor componente, etc.).",
      "file": "ruta/del/archivo.tsx (opcional)"
    }
  ],
  "followupInstruction": "Instrucción accionable lista para que el cerebro GafCore aplique los fixes en el próximo turno. Debe empezar por '[modo profundo] Aplica estas mejoras de diseño:' y listar 5-10 mejoras concretas con su archivo."
}

Reglas:
- Máximo 12 issues priorizadas (lo que más mejora la calidad percibida primero).
- Si recibes screenshot, prioriza problemas visibles: jerarquía, espaciado, contraste, imágenes, equilibrio.
- Si solo recibes código, foca en consistencia de tokens, accesibilidad y estados.
- NUNCA inventes issues que no estén respaldadas por evidencia del input.
- Voz en español, concisa y respetuosa.`;
}

/** Construye el user message con el código truncado y las heurísticas pre-detectadas. */
export function buildCritiqueUserMessage(input: {
  files: ProjFileLike[];
  brandName?: string;
  staticIssues: DesignIssue[];
  brief?: string;
}): string {
  const codeBlock = input.files
    .filter((f) => /\.(tsx?|jsx?|html?|css)$/i.test(f.name))
    .slice(0, 12)
    .map((f) => `--- ${f.name} ---\n${f.content.slice(0, 6000)}`)
    .join("\n\n");

  const staticBlock = input.staticIssues.length
    ? `\n\nIssues pre-detectados (confirma o descarta):\n${input.staticIssues
        .map((i) => `- [${i.severity}] ${i.title} — ${i.detail}`)
        .join("\n")}`
    : "";

  const brand = input.brandName ? `\n\nMarca del proyecto: ${input.brandName}` : "";
  const brief = input.brief ? `\n\nContexto del briefing: ${input.brief}` : "";

  return `Audita el siguiente proyecto y devuelve la crítica JSON estricta.${brand}${brief}${staticBlock}\n\n--- CÓDIGO ---\n${codeBlock}`;
}
