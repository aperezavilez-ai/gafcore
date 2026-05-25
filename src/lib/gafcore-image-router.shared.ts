/**
 * Router de generación de imágenes — elige el modelo según la intención.
 *
 * Modelos (todos vía Replicate, una sola REPLICATE_API_TOKEN):
 * - **Flux 1.1 Pro Ultra**: hero, lifestyle, fotografía premium (16:9, 9:16, 1:1).
 * - **Recraft v3**: logos, ilustraciones vectoriales, iconos consistentes (raster) o SVG.
 * - **Ideogram v3 Turbo**: banners con texto integrado, posters, infografías.
 * - **Flux Schnell**: fallback rápido / bajo coste (4 pasos, 1-3s).
 */

export type ImageIntent =
  | "hero"
  | "logo"
  | "icon"
  | "banner_text"
  | "product"
  | "avatar"
  | "illustration"
  | "background"
  | "generic";

export type ImageModel =
  | "flux-1.1-pro-ultra"
  | "flux-schnell"
  | "recraft-v3"
  | "recraft-v3-svg"
  | "ideogram-v3-turbo";

export type ImageAspect = "1:1" | "16:9" | "9:16" | "3:4" | "4:3" | "21:9";

export type ImageRequest = {
  intent: ImageIntent;
  model: ImageModel;
  aspectRatio: ImageAspect;
  prompt: string;
  /** Estilo opcional para Recraft / Ideogram (realistic_image, vector_illustration, digital_illustration, etc). */
  style?: string;
};

/**
 * Detecta la intención a partir de la instrucción del usuario y/o contexto de la URL rota.
 */
export function detectImageIntent(input: {
  instruction: string;
  brokenUrl?: string;
  context?: string;
}): ImageIntent {
  const text = [input.instruction, input.brokenUrl ?? "", input.context ?? ""].join(" ").toLowerCase();

  if (/\blogo\b|logotipo|isotipo|brand\s*mark|wordmark/i.test(text)) return "logo";
  if (/\bicono?s?\b|icon\b|favicon|pictograma/i.test(text)) return "icon";
  if (/avatar|perfil|profile.*pic|retrato.*usuario/i.test(text)) return "avatar";
  if (/\bbanner\b.*texto|cartel|poster|promo.*texto|sale.*sign|cta.*image/i.test(text))
    return "banner_text";
  if (/producto|product\b|catalog|catálogo|item\b|zapato|tenis|prenda|botella|envase/i.test(text))
    return "product";
  if (/ilustraci|illustration|dibujo|drawing|cartoon|sketch|isom[eé]trico/i.test(text))
    return "illustration";
  if (/fondo|background|wallpaper|patr[oó]n.*fondo|texture/i.test(text)) return "background";
  if (
    /hero|portada|cover|landing.*main|principal|cabecera|principal.*imagen|imagen.*hero|fotograf/i.test(
      text,
    )
  )
    return "hero";
  return "generic";
}

/** Mapa intención → (modelo, aspecto sugerido, style). */
export function pickImageModel(intent: ImageIntent): {
  model: ImageModel;
  aspectRatio: ImageAspect;
  style?: string;
} {
  switch (intent) {
    case "logo":
      return { model: "recraft-v3-svg", aspectRatio: "1:1", style: "vector_illustration" };
    case "icon":
      return { model: "recraft-v3", aspectRatio: "1:1", style: "vector_illustration" };
    case "avatar":
      return { model: "flux-1.1-pro-ultra", aspectRatio: "1:1" };
    case "banner_text":
      return { model: "ideogram-v3-turbo", aspectRatio: "16:9" };
    case "product":
      return { model: "flux-1.1-pro-ultra", aspectRatio: "1:1" };
    case "illustration":
      return { model: "recraft-v3", aspectRatio: "16:9", style: "digital_illustration" };
    case "background":
      return { model: "flux-schnell", aspectRatio: "16:9" };
    case "hero":
      return { model: "flux-1.1-pro-ultra", aspectRatio: "16:9" };
    default:
      return { model: "flux-schnell", aspectRatio: "16:9" };
  }
}

/** Construye el prompt enriquecido para cada modelo. */
export function buildImagePrompt(intent: ImageIntent, userPrompt: string): string {
  const base = userPrompt.trim().slice(0, 700);
  switch (intent) {
    case "hero":
      return `${base}. Professional hero image, cinematic lighting, high resolution, sharp focus, commercial photography, modern aesthetic`;
    case "product":
      return `${base}. Product photography, clean neutral background, soft studio lighting, sharp focus, e-commerce style, centered composition`;
    case "logo":
      return `${base}. Minimalist modern logo, vector style, flat design, clean shapes, professional brand identity, white background`;
    case "icon":
      return `${base}. Single flat icon, line art, minimal, centered, no background, consistent stroke width`;
    case "avatar":
      return `${base}. Professional portrait, natural lighting, neutral background, sharp focus, friendly expression`;
    case "banner_text":
      return `${base}. Marketing banner with bold readable typography integrated in the composition, high contrast, eye-catching`;
    case "illustration":
      return `${base}. Modern flat illustration, vibrant colors, clean composition, editorial style`;
    case "background":
      return `${base}. Abstract subtle background, soft gradient, low contrast, suitable as website backdrop`;
    default:
      return `${base}. Professional high quality, sharp focus, well composed`;
  }
}

export function planImage(input: {
  instruction: string;
  brokenUrl?: string;
  context?: string;
}): ImageRequest {
  const intent = detectImageIntent(input);
  const picked = pickImageModel(intent);
  const prompt = buildImagePrompt(intent, input.instruction);
  return { intent, ...picked, prompt };
}
