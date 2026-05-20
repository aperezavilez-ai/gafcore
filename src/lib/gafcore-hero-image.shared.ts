/** URLs de hero según el pedido del usuario (sin dependencias circulares). */

export type HeroImageTheme = {
  seed: string;
  url: string;
  descriptionEs: string;
};

function picsumUrl(seed: string, w = 1280, h = 720): string {
  const s = encodeURIComponent(seed.replace(/[^a-zA-Z0-9-_]+/g, "-").slice(0, 48) || "gafcore");
  return `https://picsum.photos/seed/${s}/${w}/${h}`;
}

/** Elige imagen de hero según el pedido literal del usuario. */
export function resolveHeroImageFromInstruction(text: string): HeroImageTheme {
  const t = text.toLowerCase();

  if (/avion|avión|aeronave|\bplane\b|volando|en\s+vuelo|cielo.*avion|avion.*cielo/i.test(t)) {
    const seed = "gafcore-sky-airplane";
    return { seed, url: picsumUrl(seed), descriptionEs: "cielo con avión" };
  }
  if (/cielo|nubes|clouds/i.test(t) && !/ciudad|city|skyline/i.test(t)) {
    const seed = "gafcore-open-sky";
    return { seed, url: picsumUrl(seed), descriptionEs: "cielo abierto" };
  }
  if (/playa|beach|mar\b|océano|ocean/i.test(t)) {
    const seed = "gafcore-travel-beach";
    return { seed, url: picsumUrl(seed), descriptionEs: "playa / mar" };
  }
  if (/montañ|mountain|bosque|forest|naturaleza/i.test(t)) {
    const seed = "gafcore-travel-nature";
    return { seed, url: picsumUrl(seed), descriptionEs: "paisaje natural" };
  }
  if (/ciudad|city|skyline|urbano|edificios/i.test(t)) {
    const seed = "gafcore-travel-city-hero";
    return { seed, url: picsumUrl(seed), descriptionEs: "ciudad / skyline" };
  }
  if (/viaje|vuelo|aerolínea|aerolinea|travel|vuelos/i.test(t)) {
    const seed = "gafcore-sky-airplane";
    return { seed, url: picsumUrl(seed), descriptionEs: "viajes (cielo y avión)" };
  }
  const seed = "gafcore-travel-hero";
  return { seed, url: picsumUrl(seed), descriptionEs: "fondo fotográfico de viaje" };
}
