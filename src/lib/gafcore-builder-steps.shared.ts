/**
 * Guía de pasos del builder V2: pestañas de sección (Hero, Features, Precios...)
 * según el tipo de proyecto detectado en el primer mensaje del usuario.
 *
 * Adaptado de gafcore-chat-suggestions.shared.ts (IDE legado, multi-archivo React)
 * para trabajar con un único documento HTML autónomo. Al elegir una pestaña,
 * su `prompt` guía se coloca como placeholder del textarea para orientar al
 * usuario sobre qué pedir; `isDone` inspecciona el HTML actual para marcar
 * pestañas ya cubiertas con un punto visual.
 */

export type GafcoreBuilderStepStatus = "completed" | "current" | "upcoming";

export type GafcoreBuilderStep = {
  id: string;
  label: string;
  prompt: string;
  status: GafcoreBuilderStepStatus;
};

export type ProjectType =
  | "ecommerce"
  | "restaurant"
  | "app"
  | "landing"
  | "blog"
  | "generic";

type StepTemplate = {
  id: string;
  label: string;
  prompt: string;
  isDone: (htmlLower: string) => boolean;
};

const USER_INTENT_RE =
  /\b(quiero|necesito|crea|crear|genera|generar|construye|construir|app|aplicaci[oó]n|sitio|web|landing|taxi|tienda|dashboard|plataforma|formulario|reservas|ecommerce|saas|fumigaci[oó]n|seguros|login|registro)\b/i;

export function hasSubstantiveUserIntent(text: string): boolean {
  const t = text.trim();
  if (t.length < 8) return false;
  if (/^(hola|hi|hey|buenas|ok|vale|gracias)[!.?\s]*$/i.test(t)) return false;
  return USER_INTENT_RE.test(t) || t.length >= 30;
}

/** Detecta el tipo de proyecto analizando el primer mensaje del usuario. */
export function detectProjectTypeFromUserText(text: string): ProjectType {
  const t = text.toLowerCase();
  if (/\b(tienda|vender|productos|ecommerce|e-commerce|comercio|shop)\b/i.test(t)) {
    return "ecommerce";
  }
  if (/\b(restaurante|menú|menu|pedidos)\b/i.test(t)) return "restaurant";
  if (/\b(blog|artículos|articulos|noticias)\b/i.test(t)) return "blog";
  if (/\b(app|login|usuarios|dashboard)\b/i.test(t)) return "app";
  if (/\b(landing|sitio|página web|pagina web|website|página|pagina|negocio|fumigaci[oó]n)\b/i.test(t)) {
    return "landing";
  }
  return "generic";
}

function stepsForType(type: ProjectType): StepTemplate[] {
  switch (type) {
    case "ecommerce":
      return [
        {
          id: "feat-catalog",
          label: "Catálogo",
          prompt:
            "Construye un catálogo de productos con grid, imágenes, precios y filtros básicos. Mantén el diseño premium.",
          isDone: (h) => /catálogo|catalogo|productos|precio/i.test(h),
        },
        {
          id: "feat-cart",
          label: "Carrito",
          prompt: "Añade carrito de compras: contador de artículos, lista y total visible.",
          isDone: (h) => /carrito|cart/i.test(h),
        },
        {
          id: "feat-checkout",
          label: "Checkout",
          prompt: "Implementa flujo de checkout: resumen del pedido, formulario de envío y confirmación visible.",
          isDone: (h) => /checkout|finalizar compra/i.test(h),
        },
        {
          id: "feat-reviews",
          label: "Reseñas",
          prompt: "Añade sección de reseñas de clientes con nombre, calificación y comentario.",
          isDone: (h) => /reseñ|testimonio|review/i.test(h),
        },
        {
          id: "feat-contact",
          label: "Contacto",
          prompt: "Añade formulario de contacto con nombre, email, mensaje y botón de envío.",
          isDone: (h) => /contacto|contact/i.test(h),
        },
      ];
    case "restaurant":
      return [
        {
          id: "feat-menu",
          label: "Menú",
          prompt: "Crea un menú digital con categorías, platos, precios y descripciones.",
          isDone: (h) => /menú|menu|carta|platos/i.test(h),
        },
        {
          id: "feat-reservations",
          label: "Reservaciones",
          prompt: "Añade formulario de reservaciones: fecha, hora, número de comensales y confirmación.",
          isDone: (h) => /reserv|mesa|booking/i.test(h),
        },
        {
          id: "feat-gallery",
          label: "Galería",
          prompt: "Añade galería de fotos del restaurante y los platillos.",
          isDone: (h) => /galer[ií]a|gallery/i.test(h),
        },
        {
          id: "feat-contact",
          label: "Contacto",
          prompt: "Añade sección de contacto con dirección, horario y formulario.",
          isDone: (h) => /contacto|contact|horario/i.test(h),
        },
      ];
    case "app":
      return [
        {
          id: "feat-hero",
          label: "Hero",
          prompt: "Diseña una hero section con titular, subtítulo y CTA principal para la app.",
          isDone: (h) => /hero|titular|cta/i.test(h),
        },
        {
          id: "feat-features",
          label: "Features",
          prompt: "Añade sección de funcionalidades clave con iconos y descripciones cortas.",
          isDone: (h) => /features|funcionalidad|beneficios/i.test(h),
        },
        {
          id: "feat-pricing",
          label: "Precios",
          prompt: "Crea sección de planes y precios con comparación y botones CTA.",
          isDone: (h) => /precio|pricing|planes/i.test(h),
        },
        {
          id: "feat-contact",
          label: "Contacto",
          prompt: "Añade formulario de contacto con validación y mensaje de éxito.",
          isDone: (h) => /contacto|contact/i.test(h),
        },
      ];
    case "blog":
      return [
        {
          id: "feat-posts",
          label: "Artículos",
          prompt: "Crea lista de artículos con título, extracto, fecha e imagen.",
          isDone: (h) => /artículo|articulo|post/i.test(h),
        },
        {
          id: "feat-categories",
          label: "Categorías",
          prompt: "Añade categorías o etiquetas para filtrar artículos.",
          isDone: (h) => /categoría|categoria|etiqueta/i.test(h),
        },
        {
          id: "feat-newsletter",
          label: "Newsletter",
          prompt: "Añade formulario de suscripción a newsletter con email y botón.",
          isDone: (h) => /newsletter|suscrib/i.test(h),
        },
        {
          id: "feat-contact",
          label: "Contacto",
          prompt: "Añade sección de contacto con formulario.",
          isDone: (h) => /contacto|contact/i.test(h),
        },
      ];
    case "landing":
      return [
        {
          id: "feat-hero",
          label: "Hero section",
          prompt:
            "Diseña una hero section impactante: titular, subtítulo, CTA principal y fondo premium acorde a la marca.",
          isDone: (h) => /hero|titular|cta/i.test(h),
        },
        {
          id: "feat-features",
          label: "Features",
          prompt: "Añade sección de features/beneficios con iconos, grid responsive y copy persuasivo.",
          isDone: (h) => /features|beneficios|ventajas/i.test(h),
        },
        {
          id: "feat-pricing",
          label: "Precios",
          prompt: "Crea sección de precios con planes, comparación y botones CTA en cada tarjeta.",
          isDone: (h) => /precio|pricing|planes/i.test(h),
        },
        {
          id: "feat-contact",
          label: "Contacto",
          prompt: "Añade formulario de contacto con validación de email y mensaje de éxito visible.",
          isDone: (h) => /<form[\s\S]*?>/i.test(h) && /contacto|contact/i.test(h),
        },
        {
          id: "feat-seo",
          label: "SEO",
          prompt: "Optimiza SEO básico: title y meta description claros, headings semánticos y alt en imágenes.",
          isDone: (h) => /<title>/i.test(h) && /name=["']description["']/i.test(h),
        },
      ];
    default:
      return stepsForType("landing");
  }
}

function assignStatuses(
  items: Array<{ id: string; label: string; prompt: string; done: boolean }>,
): GafcoreBuilderStep[] {
  let currentAssigned = false;
  return items.map((item) => {
    let status: GafcoreBuilderStepStatus;
    if (item.done) {
      status = "completed";
    } else if (!currentAssigned) {
      status = "current";
      currentAssigned = true;
    } else {
      status = "upcoming";
    }
    return { id: item.id, label: item.label, prompt: item.prompt, status };
  });
}

/**
 * Devuelve las pestañas de sección para el builder, según el primer mensaje
 * del usuario y el HTML actual (para marcar pestañas ya cubiertas).
 * Si no hay mensajes aún, devuelve las pestañas por defecto de tipo "landing"
 * (Hero, Features, Precios, Contacto, SEO) sin marcar nada como completado.
 */
export function getBuilderSteps(
  firstUserMessage: string,
  currentHtml: string | null,
): GafcoreBuilderStep[] {
  const projectType = firstUserMessage
    ? detectProjectTypeFromUserText(firstUserMessage)
    : "landing";
  const templates = stepsForType(projectType);
  const htmlLower = (currentHtml ?? "").toLowerCase();

  const items = templates.map((t) => ({
    id: t.id,
    label: t.label,
    prompt: t.prompt,
    done: currentHtml ? t.isDone(htmlLower) : false,
  }));

  return assignStatuses(items);
}
