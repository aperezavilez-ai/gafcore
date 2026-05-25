/**
 * Schema y presets del **brand** de un proyecto GafCore.
 * Persistido en tabla `gafcore_project_brands` (1:1 con `projects.id`).
 * Inyectado como bloque de contexto en el system prompt del cerebro para
 * garantizar coherencia visual entre páginas y turnos del mismo proyecto.
 */
import { z } from "zod";

export const brandPaletteSchema = z.object({
  primary: z.string().min(3).max(64),
  secondary: z.string().min(3).max(64),
  accent: z.string().min(3).max(64),
  background: z.string().min(3).max(64),
  foreground: z.string().min(3).max(64),
  muted: z.string().min(3).max(64),
  border: z.string().min(3).max(64),
});

export const brandTypographySchema = z.object({
  display: z.string().min(2).max(64),
  text: z.string().min(2).max(64),
  scale: z.number().min(1.1).max(1.6),
});

export const brandShapeSchema = z.object({
  radius: z.enum(["sm", "md", "lg", "xl", "2xl"]),
  shadow: z.enum(["none", "soft", "medium", "strong"]),
});

export const brandSectorSchema = z.enum([
  "saas-b2b",
  "fintech",
  "ecommerce-fashion",
  "ecommerce-general",
  "restaurant-local",
  "tech-tools",
  "professional-services",
  "education-courses",
  "creative-agency",
  "healthcare",
  "real-estate",
  "fitness-wellness",
  "generic",
]);

export const brandSchema = z.object({
  name: z.string().min(1).max(80),
  tagline: z.string().max(200).optional(),
  sector: brandSectorSchema,
  mood: z.array(z.string().max(40)).min(1).max(5),
  palette: brandPaletteSchema,
  typography: brandTypographySchema,
  shape: brandShapeSchema,
  copyVoice: z.string().max(200).default("cercano y profesional, en español"),
  version: z.literal(1).default(1),
});

export type BrandPalette = z.infer<typeof brandPaletteSchema>;
export type BrandTypography = z.infer<typeof brandTypographySchema>;
export type BrandShape = z.infer<typeof brandShapeSchema>;
export type BrandSector = z.infer<typeof brandSectorSchema>;
export type Brand = z.infer<typeof brandSchema>;

/**
 * Presets visuales por vertical. El usuario solo elige sector + nombre + mood,
 * el resto se hidrata con un preset razonable que el cerebro respeta y refina.
 */
export const brandPresets: Record<BrandSector, Omit<Brand, "name" | "tagline" | "mood">> = {
  "saas-b2b": {
    sector: "saas-b2b",
    palette: {
      primary: "oklch(0.55 0.22 264)",
      secondary: "oklch(0.30 0.05 264)",
      accent: "oklch(0.70 0.20 200)",
      background: "oklch(1.00 0 0)",
      foreground: "oklch(0.15 0.02 264)",
      muted: "oklch(0.96 0.01 264)",
      border: "oklch(0.90 0.01 264)",
    },
    typography: { display: "Geist", text: "Inter", scale: 1.25 },
    shape: { radius: "lg", shadow: "soft" },
    copyVoice: "claro y profesional, beneficios concretos, métricas",
    version: 1,
  },
  fintech: {
    sector: "fintech",
    palette: {
      primary: "oklch(0.45 0.18 250)",
      secondary: "oklch(0.25 0.04 250)",
      accent: "oklch(0.75 0.18 145)",
      background: "oklch(0.99 0 0)",
      foreground: "oklch(0.12 0.02 250)",
      muted: "oklch(0.95 0.01 250)",
      border: "oklch(0.88 0.01 250)",
    },
    typography: { display: "Geist", text: "Inter", scale: 1.25 },
    shape: { radius: "md", shadow: "medium" },
    copyVoice: "confianza, seguridad, números, regulación",
    version: 1,
  },
  "ecommerce-fashion": {
    sector: "ecommerce-fashion",
    palette: {
      primary: "oklch(0.20 0.02 30)",
      secondary: "oklch(0.50 0.05 30)",
      accent: "oklch(0.75 0.18 50)",
      background: "oklch(0.99 0.005 80)",
      foreground: "oklch(0.15 0.01 30)",
      muted: "oklch(0.95 0.01 80)",
      border: "oklch(0.88 0.01 80)",
    },
    typography: { display: "Cormorant Garamond", text: "Inter", scale: 1.333 },
    shape: { radius: "sm", shadow: "soft" },
    copyVoice: "elegante, aspiracional, descripción sensorial",
    version: 1,
  },
  "ecommerce-general": {
    sector: "ecommerce-general",
    palette: {
      primary: "oklch(0.55 0.22 25)",
      secondary: "oklch(0.30 0.04 25)",
      accent: "oklch(0.70 0.20 150)",
      background: "oklch(1.00 0 0)",
      foreground: "oklch(0.15 0.01 25)",
      muted: "oklch(0.96 0.01 25)",
      border: "oklch(0.90 0.01 25)",
    },
    typography: { display: "Inter", text: "Inter", scale: 1.25 },
    shape: { radius: "lg", shadow: "soft" },
    copyVoice: "directo, accionable, urgencia y beneficio",
    version: 1,
  },
  "restaurant-local": {
    sector: "restaurant-local",
    palette: {
      primary: "oklch(0.50 0.18 50)",
      secondary: "oklch(0.35 0.08 50)",
      accent: "oklch(0.65 0.20 120)",
      background: "oklch(0.98 0.01 80)",
      foreground: "oklch(0.20 0.02 50)",
      muted: "oklch(0.94 0.02 80)",
      border: "oklch(0.87 0.02 80)",
    },
    typography: { display: "Playfair Display", text: "Inter", scale: 1.333 },
    shape: { radius: "md", shadow: "medium" },
    copyVoice: "cálido y cercano, sensorial, invita a la experiencia",
    version: 1,
  },
  "tech-tools": {
    sector: "tech-tools",
    palette: {
      primary: "oklch(0.75 0.20 145)",
      secondary: "oklch(0.55 0.18 145)",
      accent: "oklch(0.80 0.25 100)",
      background: "oklch(0.12 0.01 264)",
      foreground: "oklch(0.96 0.01 264)",
      muted: "oklch(0.20 0.02 264)",
      border: "oklch(0.30 0.02 264)",
    },
    typography: { display: "Space Grotesk", text: "Geist Mono", scale: 1.25 },
    shape: { radius: "md", shadow: "none" },
    copyVoice: "técnico y preciso, mostrar código, datos, performance",
    version: 1,
  },
  "professional-services": {
    sector: "professional-services",
    palette: {
      primary: "oklch(0.30 0.10 230)",
      secondary: "oklch(0.50 0.06 230)",
      accent: "oklch(0.65 0.16 50)",
      background: "oklch(0.99 0 0)",
      foreground: "oklch(0.18 0.02 230)",
      muted: "oklch(0.95 0.01 230)",
      border: "oklch(0.88 0.01 230)",
    },
    typography: { display: "Inter", text: "Inter", scale: 1.25 },
    shape: { radius: "md", shadow: "soft" },
    copyVoice: "confianza y experiencia, casos reales, testimonios",
    version: 1,
  },
  "education-courses": {
    sector: "education-courses",
    palette: {
      primary: "oklch(0.60 0.22 280)",
      secondary: "oklch(0.40 0.10 280)",
      accent: "oklch(0.75 0.20 50)",
      background: "oklch(1.00 0 0)",
      foreground: "oklch(0.18 0.02 280)",
      muted: "oklch(0.96 0.01 280)",
      border: "oklch(0.90 0.01 280)",
    },
    typography: { display: "Inter", text: "Inter", scale: 1.25 },
    shape: { radius: "xl", shadow: "soft" },
    copyVoice: "amigable y motivador, progresión, logros",
    version: 1,
  },
  "creative-agency": {
    sector: "creative-agency",
    palette: {
      primary: "oklch(0.30 0.03 60)",
      secondary: "oklch(0.55 0.05 60)",
      accent: "oklch(0.70 0.22 30)",
      background: "oklch(0.98 0.005 60)",
      foreground: "oklch(0.15 0.01 60)",
      muted: "oklch(0.94 0.01 60)",
      border: "oklch(0.87 0.01 60)",
    },
    typography: { display: "Space Grotesk", text: "Inter", scale: 1.333 },
    shape: { radius: "lg", shadow: "strong" },
    copyVoice: "atrevido, conceptual, sorpresa, portafolio visual",
    version: 1,
  },
  healthcare: {
    sector: "healthcare",
    palette: {
      primary: "oklch(0.55 0.14 180)",
      secondary: "oklch(0.35 0.06 180)",
      accent: "oklch(0.70 0.18 30)",
      background: "oklch(0.99 0.005 180)",
      foreground: "oklch(0.18 0.02 180)",
      muted: "oklch(0.96 0.01 180)",
      border: "oklch(0.90 0.01 180)",
    },
    typography: { display: "Inter", text: "Inter", scale: 1.25 },
    shape: { radius: "lg", shadow: "soft" },
    copyVoice: "cercano y profesional, claridad, empatía",
    version: 1,
  },
  "real-estate": {
    sector: "real-estate",
    palette: {
      primary: "oklch(0.30 0.05 60)",
      secondary: "oklch(0.55 0.04 60)",
      accent: "oklch(0.65 0.18 50)",
      background: "oklch(0.98 0.005 60)",
      foreground: "oklch(0.15 0.01 60)",
      muted: "oklch(0.94 0.01 60)",
      border: "oklch(0.87 0.01 60)",
    },
    typography: { display: "Playfair Display", text: "Inter", scale: 1.333 },
    shape: { radius: "md", shadow: "medium" },
    copyVoice: "aspiracional, imagen primero, beneficios de ubicación",
    version: 1,
  },
  "fitness-wellness": {
    sector: "fitness-wellness",
    palette: {
      primary: "oklch(0.45 0.20 25)",
      secondary: "oklch(0.30 0.10 25)",
      accent: "oklch(0.75 0.22 145)",
      background: "oklch(0.99 0 0)",
      foreground: "oklch(0.15 0.01 25)",
      muted: "oklch(0.95 0.01 25)",
      border: "oklch(0.88 0.01 25)",
    },
    typography: { display: "Space Grotesk", text: "Inter", scale: 1.333 },
    shape: { radius: "xl", shadow: "medium" },
    copyVoice: "enérgico y motivacional, resultados, comunidad",
    version: 1,
  },
  generic: {
    sector: "generic",
    palette: {
      primary: "oklch(0.55 0.22 264)",
      secondary: "oklch(0.30 0.05 264)",
      accent: "oklch(0.70 0.20 50)",
      background: "oklch(1.00 0 0)",
      foreground: "oklch(0.15 0.02 264)",
      muted: "oklch(0.96 0.01 264)",
      border: "oklch(0.90 0.01 264)",
    },
    typography: { display: "Inter", text: "Inter", scale: 1.25 },
    shape: { radius: "lg", shadow: "soft" },
    copyVoice: "cercano y profesional, en español",
    version: 1,
  },
};

/** Crea un Brand completo a partir del input mínimo del usuario. */
export function buildBrandFromInput(input: {
  name: string;
  sector: BrandSector;
  mood: string[];
  tagline?: string;
  paletteOverride?: Partial<BrandPalette>;
  typographyOverride?: Partial<BrandTypography>;
}): Brand {
  const preset = brandPresets[input.sector] ?? brandPresets.generic;
  return brandSchema.parse({
    name: input.name,
    tagline: input.tagline,
    sector: input.sector,
    mood: input.mood,
    palette: { ...preset.palette, ...(input.paletteOverride ?? {}) },
    typography: { ...preset.typography, ...(input.typographyOverride ?? {}) },
    shape: preset.shape,
    copyVoice: preset.copyVoice,
    version: 1,
  });
}

/**
 * Bloque de contexto inyectado en el system prompt cuando el proyecto tiene brand.
 * El cerebro debe respetar EXACTAMENTE estos tokens en todo el código generado.
 */
export function brandContextBlock(brand: Brand): string {
  const moodList = brand.mood.join(", ");
  return `

=== BRAND DEL PROYECTO (obligatorio respetar) ===
- Marca: **${brand.name}**${brand.tagline ? ` — "${brand.tagline}"` : ""}
- Sector: ${brand.sector}
- Mood: ${moodList}
- Voz: ${brand.copyVoice}

Paleta (usa oklch en \`styles.css\` o tokens semánticos derivados):
  --primary:     ${brand.palette.primary}
  --secondary:   ${brand.palette.secondary}
  --accent:      ${brand.palette.accent}
  --background:  ${brand.palette.background}
  --foreground:  ${brand.palette.foreground}
  --muted:       ${brand.palette.muted}
  --border:      ${brand.palette.border}

Tipografía:
  display: ${brand.typography.display}
  text:    ${brand.typography.text}
  ratio:   ${brand.typography.scale}

Forma:
  radius:  ${brand.shape.radius} (aplica a botones, cards, inputs, modals)
  shadow:  ${brand.shape.shadow}

Reglas:
- Nunca uses colores hard-coded (\`bg-blue-500\`); siempre tokens \`bg-primary\`, \`text-foreground\`, etc.
- Carga las fuentes via Google Fonts o @fontsource si Vite lo permite; aplícalas en \`html\` body o en \`styles.css\`.
- Mantén el mismo radio en TODO el proyecto.
- Si generas múltiples páginas/componentes, deben verse hijas de esta marca.
`;
}

/**
 * Detecta si una instrucción es "construir desde cero" — útil para disparar el wizard.
 */
export function isFreshBuildInstruction(instruction: string): boolean {
  const t = instruction.trim().toLowerCase();
  if (t.length < 8) return false;
  return /(crea|construye|haz|genera|dise[ñn]a|monta|levanta|arma)\s+(una?\s+)?(landing|p[aá]gina|web|sitio|app|aplicaci[oó]n|tienda|portfolio|portafolio|catal[oó]go|dashboard|blog|saas|herramient|marketing)/i.test(
    t,
  );
}
