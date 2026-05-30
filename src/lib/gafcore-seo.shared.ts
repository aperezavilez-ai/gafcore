import { getPublicSiteOrigin } from "@/lib/public-site-url";

export const GAFCORE_SEO_KEYWORDS =
  "crear app con IA en México, crear app con inteligencia artificial México, desarrollar app con IA, plataforma no-code IA, GafCore, sitio web con IA, prototipo app México";

export const GAFCORE_SEO_TITLE =
  "GafCore — Crear app con IA en México | Plataforma de creación";

export const GAFCORE_SEO_DESCRIPTION =
  "Crea apps y sitios web con inteligencia artificial en México. Chat en español, preview en vivo, editor integrado y despliegue desde GafCore — sin partir de cero.";

export const GAFCORE_LANDING_TITLE =
  "GafCore — Crear tu app con IA en México";

export const GAFCORE_LANDING_DESCRIPTION =
  "Describe tu idea en español y GafCore genera código, diseño y base de datos. Plataforma premium para emprendedores y equipos en México.";

/** Rutas públicas indexables (sin auth ni admin). */
export const GAFCORE_PUBLIC_SITEMAP_PATHS = [
  "/",
  "/gafcore",
  "/login",
  "/register",
  "/gafcore/register",
  "/terms",
  "/privacy",
  "/refund",
  "/credits",
] as const;

export type GafcoreMetaTag =
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string }
  | { charSet: string }
  | { httpEquiv: string; content: string };

export function buildGafcoreSeoMeta(options?: {
  title?: string;
  description?: string;
  path?: string;
  noindex?: boolean;
}): GafcoreMetaTag[] {
  const site = getPublicSiteOrigin();
  const title = options?.title ?? GAFCORE_SEO_TITLE;
  const description = options?.description ?? GAFCORE_SEO_DESCRIPTION;
  const canonical = options?.path ? `${site}${options.path.startsWith("/") ? options.path : `/${options.path}`}` : site;

  const meta: GafcoreMetaTag[] = [
    { charSet: "utf-8" },
    {
      name: "viewport",
      content: "width=device-width, initial-scale=1, viewport-fit=cover",
    },
    { title },
    { name: "description", content: description },
    { name: "keywords", content: GAFCORE_SEO_KEYWORDS },
    { name: "author", content: "GafCore" },
    { name: "robots", content: options?.noindex ? "noindex, nofollow" : "index, follow" },
    { name: "geo.region", content: "MX" },
    { name: "geo.placename", content: "México" },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:url", content: canonical },
    { property: "og:site_name", content: "GafCore" },
    { property: "og:locale", content: "es_MX" },
    { property: "og:image", content: `${site}/og-image.png` },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: `${site}/og-image.png` },
  ];

  return meta;
}

export function buildGafcoreJsonLd(): Record<string, unknown> {
  const site = getPublicSiteOrigin();
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: "GafCore",
        url: site,
        logo: `${site}/gafcore-logo.png`,
        description: GAFCORE_SEO_DESCRIPTION,
        areaServed: { "@type": "Country", name: "México" },
      },
      {
        "@type": "WebSite",
        name: "GafCore",
        url: site,
        inLanguage: "es-MX",
        description: GAFCORE_SEO_DESCRIPTION,
        potentialAction: {
          "@type": "SearchAction",
          target: `${site}/gafcore?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "SoftwareApplication",
        name: "GafCore",
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Web",
        offers: { "@type": "Offer", price: "0", priceCurrency: "MXN" },
        description: "Plataforma para crear apps y sitios web con inteligencia artificial en México.",
      },
    ],
  };
}

export function gafcoreSeoHeadLinks(path?: string): { rel: string; href: string }[] {
  const site = getPublicSiteOrigin();
  const href = path ? `${site}${path.startsWith("/") ? path : `/${path}`}` : site;
  return [{ rel: "canonical", href }];
}
