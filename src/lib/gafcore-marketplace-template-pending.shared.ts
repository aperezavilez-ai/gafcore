/** Cola en sessionStorage: crear proyecto en el IDE con plantilla del marketplace. */

export const PENDING_TEMPLATE_SLUG_KEY = "gafcore_pending_template_slug";
export const PENDING_TEMPLATE_NAME_KEY = "gafcore_pending_template_name";
export const PENDING_TEMPLATE_AUTO_CREATE_KEY = "gafcore_auto_create_template";

export function queueMarketplaceTemplateProject(templateSlug: string, templateName: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(PENDING_TEMPLATE_SLUG_KEY, templateSlug);
  sessionStorage.setItem(PENDING_TEMPLATE_NAME_KEY, templateName);
  sessionStorage.setItem(PENDING_TEMPLATE_AUTO_CREATE_KEY, "1");
  sessionStorage.removeItem("gafcore_open_new_project");
}

export function readPendingMarketplaceTemplate(): { slug: string; name: string } | null {
  if (typeof window === "undefined") return null;
  const slug = sessionStorage.getItem(PENDING_TEMPLATE_SLUG_KEY)?.trim();
  if (!slug) return null;
  const name = sessionStorage.getItem(PENDING_TEMPLATE_NAME_KEY)?.trim() || "Mi proyecto";
  return { slug, name };
}

export function shouldAutoCreatePendingMarketplaceTemplate(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(PENDING_TEMPLATE_AUTO_CREATE_KEY) === "1";
}

export function clearPendingMarketplaceTemplate(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(PENDING_TEMPLATE_SLUG_KEY);
  sessionStorage.removeItem(PENDING_TEMPLATE_NAME_KEY);
  sessionStorage.removeItem(PENDING_TEMPLATE_AUTO_CREATE_KEY);
}

export function isTruthyNewProjectSearchParam(value: string | null): boolean {
  if (!value) return false;
  const v = value.replace(/^["']|["']$/g, "").trim().toLowerCase();
  return v === "1" || v === "true";
}

export function suggestProjectNameFromTemplate(templateName: string): string {
  const t = templateName.trim();
  if (!t) return "Mi proyecto";
  if (/^mi\s/i.test(t)) return t.slice(0, 80);
  if (/tienda/i.test(t)) return "Mi tienda";
  if (/landing/i.test(t)) return "Mi landing";
  if (/app\s+m[oó]vil/i.test(t)) return "Mi app móvil";
  if (t.length <= 48) return t;
  return "Mi proyecto";
}
