import { GAFCORE_DEFAULT_TEMPLATE_SLUG } from "@/lib/gafcore-templates.shared";
import type { ProjectTypeHint, UserIntent } from "@/orchestrator/types";

const TYPE_TO_SLUG: Record<ProjectTypeHint, string> = {
  blank: "blank-vite",
  landing: "landing-premium",
  ecommerce: "tienda-basica",
  app: "app-movil",
  unknown: GAFCORE_DEFAULT_TEMPLATE_SLUG,
};

/**
 * Sugiere plantilla según intención (no crea proyecto; eso sigue en NewProjectDialog).
 */
export function selectTemplateSlug(intent: UserIntent): string {
  if (intent.kind === "template" || intent.projectType !== "unknown") {
    return TYPE_TO_SLUG[intent.projectType] ?? GAFCORE_DEFAULT_TEMPLATE_SLUG;
  }
  return GAFCORE_DEFAULT_TEMPLATE_SLUG;
}
