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
      "[plantilla: landing] Incluye hero con titular claro, subtítulo, CTA primario, bloque de 3 features con iconos lucide, sección pricing (3 planes) o CTA final, footer con enlaces. Mobile-first, tokens semánticos (bg-background, text-foreground).",
  },
  ecommerce: {
    id: "ecommerce",
    label: "Tienda básica",
    templateSlug: "tienda-basica",
    requiredSections: ["header", "grid productos", "carrito o CTA compra"],
    promptAddon:
      "[plantilla: ecommerce] Catálogo con grid de productos (imagen, nombre, precio), header con logo y carrito, filtros simples, estados hover. Sin checkout real — mock funcional con localStorage.",
  },
  app: {
    id: "dashboard",
    label: "Dashboard",
    templateSlug: "blank-vite",
    requiredSections: ["sidebar o nav", "tarjetas KPI", "tabla o lista"],
    promptAddon:
      "[plantilla: dashboard] Panel con sidebar, 3-4 tarjetas KPI, tabla o lista de items, barra superior con título y acción. Diseño denso pero legible; dark/light coherente.",
  },
  blank: {
    id: "starter",
    label: "Starter funcional",
    templateSlug: "blank-vite",
    requiredSections: ["App.tsx", "estructura mínima usable"],
    promptAddon:
      "[plantilla: starter] App mínima funcional con una pantalla clara y navegación básica si aplica.",
  },
  unknown: {
    id: "saas",
    label: "SaaS genérico",
    templateSlug: "landing-premium",
    requiredSections: ["hero", "valor", "CTA"],
    promptAddon:
      "[plantilla: saas] Landing profesional B2B: hero, propuesta de valor, 3 beneficios, CTA y footer.",
  },
};

export function resolveFactoryTemplateProfile(instruction: string): FactoryTemplateProfile {
  const intent = classifyUserIntent(instruction, { mode: "build" });
  const hint =
    intent.projectType !== "unknown" ? intent.projectType : inferProfileFromText(instruction);
  return PROFILES[hint] ?? PROFILES.unknown;
}

function inferProfileFromText(text: string): ProjectTypeHint {
  if (/\b(dashboard|panel de control|métricas|kpi|sidebar)\b/i.test(text)) return "app";
  if (/\b(tienda|e-?commerce|carrito|productos|shop)\b/i.test(text)) return "ecommerce";
  if (/\b(landing|hero|portada|pricing|precios)\b/i.test(text)) return "landing";
  return "unknown";
}

export function buildFactoryInstructionWithProfile(
  baseInstruction: string,
  profile: FactoryTemplateProfile,
): string {
  const sections = profile.requiredSections.join(", ");
  return `${profile.promptAddon} Secciones obligatorias: ${sections}. ${baseInstruction}`;
}

export function listFactoryTemplateProfiles(): FactoryTemplateProfile[] {
  return Object.values(PROFILES);
}
