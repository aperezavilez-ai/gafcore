/** URLs de hero según el pedido del usuario (sin dependencias circulares). */

export type HeroImageTheme = {
  seed: string;
  /** URL de la imagen elegida. Vacío si el pedido no apunta a un vertical con foto natural. */
  url: string;
  descriptionEs: string;
  /** true si detectamos un vertical compatible con foto fotográfica como hero. */
  matched: boolean;
};

function picsumUrl(seed: string, w = 1280, h = 720): string {
  const s = encodeURIComponent(seed.replace(/[^a-zA-Z0-9-_]+/g, "-").slice(0, 48) || "gafcore");
  return `https://picsum.photos/seed/${s}/${w}/${h}`;
}

/**
 * Elige imagen de hero SOLO si el pedido del usuario apunta a un vertical donde
 * una foto fotográfica grande tiene sentido (viajes, paisajes, comida, real estate, eventos).
 *
 * IMPORTANTE: para SaaS, apps, dashboards, productividad, IA, finanzas, dev tools,
 * NUNCA devolvemos foto random — el hero debe ser un mockup del producto en JSX.
 * En esos casos devolvemos `matched: false` y `url: ""`.
 */
export function resolveHeroImageFromInstruction(text: string): HeroImageTheme {
  const t = (text || "").toLowerCase();

  // Verticales que SÍ piden foto en hero.
  if (/avion|avión|aeronave|\bplane\b|volando|en\s+vuelo|cielo.*avion|avion.*cielo/i.test(t)) {
    const seed = "gafcore-sky-airplane";
    return { seed, url: picsumUrl(seed), descriptionEs: "cielo con avión", matched: true };
  }
  if (/cielo|nubes|clouds/i.test(t) && !/ciudad|city|skyline/i.test(t)) {
    const seed = "gafcore-open-sky";
    return { seed, url: picsumUrl(seed), descriptionEs: "cielo abierto", matched: true };
  }
  if (/playa|beach|mar\b|océano|ocean/i.test(t)) {
    const seed = "gafcore-travel-beach";
    return { seed, url: picsumUrl(seed), descriptionEs: "playa / mar", matched: true };
  }
  if (/montañ|mountain|bosque|forest|naturaleza|paisaje/i.test(t)) {
    const seed = "gafcore-travel-nature";
    return { seed, url: picsumUrl(seed), descriptionEs: "paisaje natural", matched: true };
  }
  if (/ciudad|city|skyline|urbano|edificios|arquitectura/i.test(t)) {
    const seed = "gafcore-travel-city-hero";
    return { seed, url: picsumUrl(seed), descriptionEs: "ciudad / skyline", matched: true };
  }
  if (/viaje|vuelo|aerolínea|aerolinea|\btravel\b|vuelos|turismo|hotel|hostal|airbnb/i.test(t)) {
    const seed = "gafcore-sky-airplane";
    return { seed, url: picsumUrl(seed), descriptionEs: "viajes (cielo y avión)", matched: true };
  }
  if (/restaurante|restaurant|comida|food|gastronom|menú|menu|chef|plato|pizza|sushi|cocin/i.test(t)) {
    const seed = "gafcore-food-hero";
    return { seed, url: picsumUrl(seed), descriptionEs: "gastronomía / comida", matched: true };
  }
  if (/moda|fashion|ropa|prenda|boutique|estilo|outfit|sastrer/i.test(t)) {
    const seed = "gafcore-fashion-hero";
    return { seed, url: picsumUrl(seed), descriptionEs: "moda / fashion", matched: true };
  }
  if (/inmobiliari|real\s*estate|propiedad|casa\s+venta|departamento|apartament/i.test(t)) {
    const seed = "gafcore-real-estate-hero";
    return { seed, url: picsumUrl(seed), descriptionEs: "inmobiliaria", matched: true };
  }
  if (/boda|wedding|evento|fiesta|concierto/i.test(t)) {
    const seed = "gafcore-event-hero";
    return { seed, url: picsumUrl(seed), descriptionEs: "evento / boda", matched: true };
  }
  if (/yoga|wellness|spa|fitness|gym|deporte|crossfit|pilates/i.test(t)) {
    const seed = "gafcore-wellness-hero";
    return { seed, url: picsumUrl(seed), descriptionEs: "wellness / fitness", matched: true };
  }
  if (/pintura|coatings|paint|barniz|fachada/i.test(t)) {
    const seed = "gafcore-paint-hero";
    return { seed, url: picsumUrl(seed), descriptionEs: "pinturas / fachadas", matched: true };
  }

  // Default: NO devolvemos foto. El hero debe ser un mockup en JSX (la IA lo construye).
  return { seed: "", url: "", descriptionEs: "", matched: false };
}

/** true cuando el hero debe ser mockup JSX (no inyectar fotos stock). */
export function prefersProductMockupHero(text: string): boolean {
  return !resolveHeroImageFromInstruction(text).matched;
}
