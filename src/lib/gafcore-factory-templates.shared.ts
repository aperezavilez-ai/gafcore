/**
 * Perfiles de plantilla Modo Fábrica — prompts más estrictos por tipo de proyecto.
 */
import type { ProjectTypeHint } from "@/orchestrator/types";
import { classifyUserIntent } from "@/orchestrator/intent.classifier";

export type FactoryTemplateProfile = {
  id: string;
  label: string;
  templateSlug: string;
  promptAddon: string;
  requiredSections: string[];
};

const PROFILES: Record<ProjectTypeHint, FactoryTemplateProfile> = {
  landing: {
    id: "landing",
    label: "Landing SaaS",
    templateSlug: "landing-premium",
    requiredSections: ["hero", "features", "pricing o CTA", "footer"],
    promptAddon:
      "[plantilla: landing premium] Incluye hero con titular claro, subtítulo, CTA primario, bloque de 3 features con iconos lucide, sección pricing (3 planes) o CTA final, footer con enlaces. Debe verse premium: composición visual, contraste alto, jerarquía tipográfica, tarjetas con profundidad suave, micro-interacciones hover/focus y ritmo de espaciado consistente. Mobile-first, tokens semánticos (bg-background, text-foreground). Evita imágenes stock genéricas y placeholders.",
  },
  ecommerce: {
    id: "ecommerce",
    label: "Tienda básica",
    templateSlug: "tienda-basica",
    requiredSections: ["header", "grid productos", "carrito o CTA compra"],
    promptAddon:
      "[plantilla: ecommerce premium] Catálogo con grid de productos (imagen, nombre, precio), header con logo y carrito, filtros simples, estados hover/focus. Diseño de marca moderno (no look de demo), tarjetas de producto con buena jerarquía visual y CTA claros. Sin checkout real — mock funcional con localStorage. Evita placeholders genéricos.",
  },
  app: {
    id: "dashboard",
    label: "Dashboard",
    templateSlug: "blank-vite",
    requiredSections: ["sidebar o nav", "tarjetas KPI", "tabla o lista"],
    promptAddon:
      "[plantilla: dashboard premium] Panel con sidebar, 3-4 tarjetas KPI, tabla o lista de items, barra superior con título y acción. Debe parecer producto SaaS real: jerarquía, densidad legible, spacing consistente, estados interactivos y dark/light coherente.",
  },
  blank: {
    id: "starter",
    label: "Starter funcional",
    templateSlug: "blank-vite",
    requiredSections: ["App.tsx", "estructura mínima usable"],
    promptAddon:
      "[plantilla: starter premium] App funcional con una pantalla clara y navegación básica si aplica. Aunque sea mínima, debe mantener acabado visual profesional (tipografía, spacing, contraste y estados UI).",
  },
  unknown: {
    id: "saas",
    label: "SaaS genérico",
    templateSlug: "landing-premium",
    requiredSections: ["hero", "valor", "CTA"],
    promptAddon:
      "[plantilla: saas premium] Landing profesional B2B: hero, propuesta de valor, 3 beneficios, CTA y footer. Evita aspecto genérico; usa layout editorial limpio, copy escaneable y secciones con ritmo visual premium.",
  },
};

const RESTAURANT_PROFILE: FactoryTemplateProfile = {
  id: "restaurant",
  label: "Restaurante premium",
  templateSlug: "landing-premium",
  requiredSections: ["hero gastronómico", "especialidades", "menú o combos", "CTA pedido"],
  promptAddon:
    "[plantilla: restaurante premium] Diseño gastronómico de alto nivel (no genérico): hero potente con identidad visual, cards de platillos con jerarquía clara (nombre, descripción, precio), bloque de combos/populares, CTA visible para pedir. Usa gradientes/superficies modernas, tipografía cuidada, microinteracciones, y mobile-first impecable. Evita stock genérico y placeholders.",
};

const PREMIUM_UI_GUARDRAILS =
  "Guardrails premium obligatorios: NO renderizar placeholders genéricos ni imágenes stock aleatorias por defecto; NO dejar cards planas sin estados; incluir hover/focus visibles en CTA; tipografía y spacing consistentes; evitar bloques vacíos de relleno.";

/** Valor del selector IDE: detección automática por texto del prompt. */
export const FACTORY_PROFILE_AUTO_ID = "auto";

const PROFILE_BY_ID: Record<string, FactoryTemplateProfile> = {
  auto: PROFILES.unknown,
  landing: PROFILES.landing,
  ecommerce: PROFILES.ecommerce,
  dashboard: PROFILES.app,
  starter: PROFILES.blank,
  saas: PROFILES.unknown,
  restaurant: RESTAURANT_PROFILE,
};

export function getFactoryTemplateProfileById(id: string): FactoryTemplateProfile | null {
  if (id === FACTORY_PROFILE_AUTO_ID) return null;
  return PROFILE_BY_ID[id] ?? null;
}

export function resolveFactoryTemplateProfile(
  instruction: string,
  profileId?: string | null,
): FactoryTemplateProfile {
  const manual = profileId && profileId !== FACTORY_PROFILE_AUTO_ID
    ? getFactoryTemplateProfileById(profileId)
    : null;
  if (manual) return manual;
  if (looksLikeRestaurant(instruction)) return RESTAURANT_PROFILE;

  const intent = classifyUserIntent(instruction, { mode: "build" });
  const hint =
    intent.projectType !== "unknown" ? intent.projectType : inferProfileFromText(instruction);
  return PROFILES[hint] ?? PROFILES.unknown;
}

/** Opciones para el menú del IDE (sin duplicar `saas` y `unknown`). */
export function listFactoryProfileSelectorOptions(): Array<{
  id: string;
  label: string;
  description: string;
}> {
  return [
    { id: FACTORY_PROFILE_AUTO_ID, label: "Auto (detectar)", description: "Según tu prompt" },
    { id: "landing", label: PROFILES.landing.label, description: PROFILES.landing.requiredSections.join(" · ") },
    { id: "dashboard", label: PROFILES.app.label, description: PROFILES.app.requiredSections.join(" · ") },
    { id: "ecommerce", label: PROFILES.ecommerce.label, description: PROFILES.ecommerce.requiredSections.join(" · ") },
    { id: "restaurant", label: RESTAURANT_PROFILE.label, description: RESTAURANT_PROFILE.requiredSections.join(" · ") },
    { id: "starter", label: PROFILES.blank.label, description: PROFILES.blank.requiredSections.join(" · ") },
    { id: "saas", label: PROFILES.unknown.label, description: PROFILES.unknown.requiredSections.join(" · ") },
  ];
}

function inferProfileFromText(text: string): ProjectTypeHint {
  if (looksLikeRestaurant(text)) return "ecommerce";
  if (/\b(dashboard|panel de control|métricas|kpi|sidebar)\b/i.test(text)) return "app";
  if (/\b(tienda|e-?commerce|carrito|productos|shop)\b/i.test(text)) return "ecommerce";
  if (/\b(landing|hero|portada|pricing|precios)\b/i.test(text)) return "landing";
  return "unknown";
}

function looksLikeRestaurant(text: string): boolean {
  return /\b(restaurante|restaurant|taquer[ií]a|taco|pizza|hamburguesa|men[uú]|platillos|domicilio|delivery|reservas)\b/i.test(
    text,
  );
}

export function buildFactoryInstructionWithProfile(
  baseInstruction: string,
  profile: FactoryTemplateProfile,
): string {
  const sections = profile.requiredSections.join(", ");
  return `${profile.promptAddon} Secciones obligatorias: ${sections}. ${PREMIUM_UI_GUARDRAILS} ${baseInstruction}`;
}

export function listFactoryTemplateProfiles(): FactoryTemplateProfile[] {
  return [...Object.values(PROFILES), RESTAURANT_PROFILE];
}
