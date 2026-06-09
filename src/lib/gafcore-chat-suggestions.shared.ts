/**
 * Guía de pasos del chat IDE: chips según el primer mensaje del usuario.
 * Al elegir un chip, el prompt va al compositor (el usuario pulsa Construir).
 */
import { isGafcoreDefaultTemplateApp } from "@/lib/gafcore-project-stale.shared";

export type GafcoreChatStepStatus = "completed" | "current" | "upcoming";

export type GafcoreChatNextStep = {
  id: string;
  label: string;
  prompt: string;
  status: GafcoreChatStepStatus;
  /** Orden en la guía (1 = primero). */
  order: number;
};

export type GafcoreChatSuggestionContext = {
  messages: Array<{ role: "user" | "ai"; content: string }>;
  files: Array<{ name: string; content: string }>;
  mode: "build" | "chat";
  factoryMode: boolean;
  visualEditOn: boolean;
  multiAgentMode: boolean;
  factoryAutoDeploy: boolean;
  lastError: string | null;
  pipelineStatus: string | null;
  validationLabel: string | null;
};

const USER_INTENT_RE =
  /\b(quiero|necesito|crea|crear|genera|generar|construye|construir|app|aplicaci[oó]n|sitio|web|landing|taxi|tienda|dashboard|plataforma|formulario|reservas|ecommerce|saas|valuaci[oó]n|seguros|login|registro)\b/i;

type ProjectType = "ecommerce" | "restaurant" | "app" | "landing" | "blog" | "generic";

type StepTemplate = {
  id: string;
  label: string;
  prompt: string;
  isDone: (ctx: GafcoreChatSuggestionContext) => boolean;
};

function firstUserMessage(messages: GafcoreChatSuggestionContext["messages"]): string {
  return messages.find((m) => m.role === "user")?.content?.trim() ?? "";
}

function allUserMessagesText(messages: GafcoreChatSuggestionContext["messages"]): string {
  return messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join("\n");
}

function allContent(files: GafcoreChatSuggestionContext["files"]): string {
  return files.map((f) => f.content).join("\n");
}

function corpus(ctx: GafcoreChatSuggestionContext): string {
  const msgs = ctx.messages
    .slice(-12)
    .map((m) => m.content)
    .join("\n");
  return `${msgs}\n${allContent(ctx.files)}`.toLowerCase();
}

function isWelcomeWorkspace(ctx: GafcoreChatSuggestionContext): boolean {
  const app = ctx.files.find((f) => /^app\.(jsx|tsx?)$/i.test(f.name));
  if (!app) return ctx.files.length === 0;
  if (isGafcoreDefaultTemplateApp(app.content)) return true;
  const blob = allContent(ctx.files);
  if (/Bienvenidos a GafCore/i.test(blob) && ctx.files.length <= 8) {
    return blob.length < 4000;
  }
  return false;
}

export function projectHasStarted(ctx: GafcoreChatSuggestionContext): boolean {
  return !isWelcomeWorkspace(ctx);
}

export function hasSubstantiveUserIntent(
  messages: GafcoreChatSuggestionContext["messages"],
): boolean {
  const text = allUserMessagesText(messages).trim();
  if (text.length < 20) return false;
  if (/^(hola|hi|hey|buenas|ok|vale|gracias)[!.?\s]*$/i.test(text)) return false;
  return USER_INTENT_RE.test(text) || text.length >= 48;
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
  if (/\b(landing|sitio|página web|pagina web|website|página|pagina)\b/i.test(t)) {
    return "landing";
  }
  return "generic";
}

const DEPLOY_STEPS: StepTemplate[] = [
  {
    id: "deploy-supabase",
    label: "Conectar Supabase",
    prompt:
      "Conecta Supabase a este proyecto: ve a Configuración → Supabase, pega tu URL y clave pública. Luego dime qué datos quieres guardar (usuarios, productos, pedidos, etc.) y lo integro.",
    isDone: (ctx) => /supabase|base de datos|database|auth\.signIn|supabase\.from/i.test(corpus(ctx)),
  },
  {
    id: "deploy-github",
    label: "Subir a GitHub",
    prompt:
      "Quiero subir este proyecto a GitHub. Necesito conectar mi cuenta: ve a Configuración → GitHub Deploy, pega tu token de GitHub y el nombre del repo (usuario/nombre-repo).",
    isDone: (ctx) => /github|git push|repositorio/i.test(corpus(ctx)),
  },
  {
    id: "deploy-vercel",
    label: "Deploy en Vercel",
    prompt:
      "Quiero publicar el proyecto en Vercel para que tenga una URL pública. Necesito el Deploy Hook: en Vercel → mi proyecto → Settings → Git → Deploy Hooks, crea uno y pégalo en Configuración → Vercel.",
    isDone: (ctx) => /vercel|en vivo|deploy|publicado|sitio activo/i.test(corpus(ctx)),
  },
];

function featureStepsForType(type: ProjectType): StepTemplate[] {
  switch (type) {
    case "ecommerce":
      return [
        {
          id: "feat-catalog",
          label: "Catálogo de productos",
          prompt:
            "Construye un catálogo de productos con grid, imágenes, precios y filtros básicos. Mantén el diseño premium y deja todo funcional en el preview.",
          isDone: (ctx) =>
            /catálogo|catalogo|productos|products|grid.*product|precio/i.test(corpus(ctx)) &&
            projectHasStarted(ctx),
        },
        {
          id: "feat-cart",
          label: "Carrito de compras",
          prompt:
            "Añade carrito de compras con estado (useState), añadir/quitar productos, contador y total. Persiste el carrito en localStorage.",
          isDone: (ctx) => /carrito|cart|addToCart|añadir al carrito/i.test(corpus(ctx)),
        },
        {
          id: "feat-checkout",
          label: "Checkout",
          prompt:
            "Implementa flujo de checkout: resumen del pedido, formulario de envío con onSubmit y confirmación visible.",
          isDone: (ctx) => /checkout|finalizar compra|resumen del pedido/i.test(corpus(ctx)),
        },
        {
          id: "feat-stripe",
          label: "Pagos Stripe",
          prompt:
            "Integra pagos con Stripe (modo demo): botón de pago, resumen y feedback de éxito/error. Explica qué clave necesito en Configuración.",
          isDone: (ctx) => /stripe|payment|pagos|tarjeta/i.test(corpus(ctx)),
        },
        {
          id: "feat-account",
          label: "Cuenta de usuario",
          prompt:
            "Añade registro e inicio de sesión con formularios onSubmit, validación y pantalla de perfil básica.",
          isDone: (ctx) =>
            /login|registro|cuenta|perfil|signup|iniciar sesi/i.test(corpus(ctx)) &&
            (/type=["']password/i.test(allContent(ctx.files)) || /correo|email/i.test(corpus(ctx))),
        },
      ];
    case "restaurant":
      return [
        {
          id: "feat-menu",
          label: "Menú digital",
          prompt:
            "Crea un menú digital con categorías, platos, precios y descripciones. Diseño claro para móvil y desktop.",
          isDone: (ctx) =>
            /menú|menu|carta|platos|entrantes|postres/i.test(corpus(ctx)) && projectHasStarted(ctx),
        },
        {
          id: "feat-orders",
          label: "Sistema de pedidos",
          prompt:
            "Implementa pedidos: añadir platos al pedido, cantidades, total y confirmación con onSubmit.",
          isDone: (ctx) => /pedido|orden|order|añadir plato/i.test(corpus(ctx)),
        },
        {
          id: "feat-reservations",
          label: "Reservaciones",
          prompt:
            "Añade reservaciones de mesa: formulario con fecha, hora, comensales y confirmación visible.",
          isDone: (ctx) => /reserv|mesa|booking/i.test(corpus(ctx)),
        },
        {
          id: "feat-payments",
          label: "Pagos",
          prompt:
            "Conecta pagos para pedidos o reservas: resumen, método de pago simulado y recibo de confirmación.",
          isDone: (ctx) => /pago|payment|stripe|tarjeta|total/i.test(corpus(ctx)),
        },
      ];
    case "app":
      return [
        {
          id: "feat-auth",
          label: "Auth/Login",
          prompt:
            "Implementa autenticación: pantallas de login y registro con formularios onSubmit, validación y navegación entre vistas.",
          isDone: (ctx) =>
            /login|registro|auth|signup|iniciar sesi/i.test(corpus(ctx)) &&
            projectHasStarted(ctx),
        },
        {
          id: "feat-dashboard",
          label: "Dashboard",
          prompt:
            "Construye un dashboard con métricas, tarjetas KPI y navegación lateral o superior. Datos de ejemplo con useState.",
          isDone: (ctx) => /dashboard|panel|métricas|metricas|kpi/i.test(corpus(ctx)),
        },
        {
          id: "feat-profile",
          label: "Perfil de usuario",
          prompt:
            "Añade pantalla de perfil editable: nombre, avatar, preferencias y botón guardar con feedback.",
          isDone: (ctx) => /perfil|profile|mi cuenta|editar usuario/i.test(corpus(ctx)),
        },
        {
          id: "feat-database",
          label: "Base de datos",
          prompt:
            "Prepara la capa de datos: modelos (usuarios, registros) y persistencia en localStorage o Supabase listo para conectar.",
          isDone: (ctx) =>
            /localStorage|supabase|database|base de datos|fetch\(/i.test(corpus(ctx)),
        },
      ];
    case "landing":
      return [
        {
          id: "feat-hero",
          label: "Hero section",
          prompt:
            "Diseña una hero section impactante: titular, subtítulo, CTA principal y fondo premium acorde a la marca.",
          isDone: (ctx) =>
            /hero|titular|cta|llamada a la acción/i.test(corpus(ctx)) && projectHasStarted(ctx),
        },
        {
          id: "feat-features",
          label: "Features",
          prompt:
            "Añade sección de features/beneficios con iconos, grid responsive y copy persuasivo.",
          isDone: (ctx) => /features|beneficios|ventajas|por qué/i.test(corpus(ctx)),
        },
        {
          id: "feat-pricing",
          label: "Precios",
          prompt:
            "Crea sección de precios con planes, comparación y botones CTA en cada tarjeta.",
          isDone: (ctx) => /precio|pricing|planes|suscripción/i.test(corpus(ctx)),
        },
        {
          id: "feat-contact",
          label: "Contacto",
          prompt:
            "Añade formulario de contacto con onSubmit, validación de email y mensaje de éxito visible.",
          isDone: (ctx) =>
            /<form[\s\S]*?onSubmit/i.test(allContent(ctx.files)) ||
            (/contacto|contact/i.test(corpus(ctx)) && /onSubmit/i.test(allContent(ctx.files))),
        },
        {
          id: "feat-seo",
          label: "SEO",
          prompt:
            "Optimiza SEO básico: title y meta description en index.html, headings semánticos y textos alt en imágenes.",
          isDone: (ctx) =>
            /<title>/i.test(allContent(ctx.files)) &&
            /meta.*description|description/i.test(allContent(ctx.files)),
        },
      ];
    case "blog":
      return [
        {
          id: "feat-post-list",
          label: "Lista de artículos",
          prompt:
            "Crea lista de artículos con título, extracto, fecha y enlace a cada post. Grid o lista responsive.",
          isDone: (ctx) =>
            /artículos|articulos|posts|blog/i.test(corpus(ctx)) && projectHasStarted(ctx),
        },
        {
          id: "feat-post-view",
          label: "Vista de post",
          prompt:
            "Implementa vista de artículo individual: título, autor, fecha, cuerpo y navegación volver al listado.",
          isDone: (ctx) => /post detail|vista de post|leer más|article view/i.test(corpus(ctx)),
        },
        {
          id: "feat-categories",
          label: "Categorías",
          prompt:
            "Añade categorías o etiquetas para filtrar artículos con chips o menú lateral.",
          isDone: (ctx) => /categoría|categoria|etiqueta|tag/i.test(corpus(ctx)),
        },
        {
          id: "feat-search",
          label: "Buscador",
          prompt:
            "Implementa buscador de artículos con input, filtrado en tiempo real y estado vacío.",
          isDone: (ctx) => /buscar|search|filtrar artículos/i.test(corpus(ctx)),
        },
      ];
    default:
      return featureStepsForType("landing");
  }
}

function assignStepStatuses(
  items: Array<{ id: string; label: string; prompt: string; done: boolean }>,
): GafcoreChatNextStep[] {
  let currentAssigned = false;
  return items.map((item, index) => {
    let status: GafcoreChatStepStatus;
    if (item.done) {
      status = "completed";
    } else if (!currentAssigned) {
      status = "current";
      currentAssigned = true;
    } else {
      status = "upcoming";
    }
    return {
      id: item.id,
      label: item.label,
      prompt: item.prompt,
      status,
      order: index + 1,
    };
  });
}

function promptForValidationError(err: string): string | null {
  const e = err.toLowerCase();
  if (/formulario sin onsubmit|onsubmit conectado/i.test(e)) {
    return (
      "Corrige el error de validación en App.tsx. Conecta onSubmit en cada formulario con e.preventDefault(), validación mínima y feedback visible. No elimines el diseño existente."
    );
  }
  if (/onclick vacío|sin onsubmit|enlace con href/i.test(e)) {
    return (
      "Corrige handlers: cada botón con onClick real o type submit dentro de form con onSubmit; sin onClick vacío ni href=\"#\" sin acción. Mantén el UI actual."
    );
  }
  if (/objects are not valid|react error #31|error #31|\{feature\}|\{stat\}/i.test(e)) {
    return (
      "Arregla los .map() en JSX: usa arrays planos de strings y elements.map((text, idx) => <li key={idx}>{text}</li>). Sin typeof, sin {item} ni objetos como hijos."
    );
  }
  if (/import roto|tags jsx|sintaxis|syntaxerror|unexpected token|script error/i.test(e)) {
    return `Corrige sintaxis e imports sin romper lo ya construido. Error detectado:\n\n${err.slice(0, 600)}`;
  }
  if (/validación|construcción fallida|functional|error/i.test(e)) {
    return `Corrige solo lo necesario para pasar la validación. Mantén el diseño actual.\n\n${err.slice(0, 700)}`;
  }
  return null;
}

function isActiveBlockingError(err: string | null): boolean {
  if (!err?.trim()) return false;
  return /syntaxerror|unexpected token|react error #31|objects are not valid|script error|validation/i.test(
    err,
  );
}

function buildProjectTypeSteps(ctx: GafcoreChatSuggestionContext): GafcoreChatNextStep[] {
  const firstUser = firstUserMessage(ctx.messages);
  if (!firstUser) return [];

  const projectType = detectProjectTypeFromUserText(firstUser);
  const templates = [...featureStepsForType(projectType), ...DEPLOY_STEPS];

  const items = templates.map((t) => ({
    id: t.id,
    label: t.label,
    prompt: t.prompt,
    done: t.isDone(ctx),
  }));

  const err = (ctx.lastError ?? "").trim();
  if (isActiveBlockingError(err)) {
    const fix = promptForValidationError(err);
    if (fix) {
      const fixItem = {
        id: "fix-runtime",
        label: "⚠ Corregir error ahora",
        prompt: fix,
        done: false,
      };
      return assignStepStatuses([fixItem, ...items]);
    }
  }

  return assignStepStatuses(items);
}

/**
 * Pasos guiados según el primer mensaje del usuario (vacío si no hay mensajes).
 */
export function getGafcoreChatNextSteps(ctx: GafcoreChatSuggestionContext): GafcoreChatNextStep[] {
  if (ctx.messages.length === 0) return [];
  return buildProjectTypeSteps(ctx);
}

/** Paso recomendado (chip resaltado). */
export function getRecommendedNextStep(steps: GafcoreChatNextStep[]): GafcoreChatNextStep | null {
  return steps.find((s) => s.status === "current") ?? steps.find((s) => s.status === "upcoming") ?? null;
}
