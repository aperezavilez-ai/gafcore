import type { ParsedAppIdea } from "../../types/parsed-idea";
import type { BlueprintFrontendRoute } from "../../types/blueprint";

export function buildFrontendRoutes(parsed: ParsedAppIdea): BlueprintFrontendRoute[] {
  return parsed.pages.map((page) => ({
    path: page.route,
    component: pageNameToComponent(page.name),
    requiresAuth: page.requiresAuth,
  }));
}

function pageNameToComponent(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9]/g, "");
  return cleaned.length > 0 ? `${cleaned}Page` : "HomePage";
}
