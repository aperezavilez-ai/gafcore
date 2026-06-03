/**
 * Guía de pasos del chat IDE: checklist completa según avance del proyecto.
 * Al elegir un chip, el prompt va al compositor (el usuario pulsa Construir).
 */
import { isGafcoreDefaultTemplateApp } from "@/lib/gafcore-project-stale.shared";
import { auditFunctionalFirst } from "@/lib/gafcore-functional-first.shared";

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

function lastMessage(
  messages: GafcoreChatSuggestionContext["messages"],
  role: "user" | "ai",
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === role) return messages[i]?.content ?? "";
  }
  return "";
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

type ProjectKind =
  | "taxi"
  | "restaurant"
  | "ecommerce"
  | "saas"
  | "portfolio"
  | "landing"
  | "generic";

function detectProjectKind(ctx: GafcoreChatSuggestionContext): ProjectKind {
  const t = corpus(ctx);
  if (/taxi|conductor|pasajero|viaje activo|pedir un taxi|911|pánico|panico/i.test(t)) {
    return "taxi";
  }
  if (
    /landing|tu landing|hero, cta|mi marca|formulario funcional|solicita información/i.test(t) &&
    !/restaurant|carta de|reserva mesa|platos del día/i.test(t)
  ) {
    return "landing";
  }
  if (/restaurant|carta de|reserva mesa|platos del|menú digital|mesa disponible/i.test(t)) {
    return "restaurant";
  }
  if (/checkout|carrito|producto|tienda|ecommerce|shop|catálogo/i.test(t)) return "ecommerce";
  if (/dashboard|saas|suscripción|subscription|kpi|autoesimate|valuaci[oó]n|seguros|daños vehiculares/i.test(t)) {
    return "saas";
  }
  if (/portfolio|portafolio|proyectos destacados/i.test(t)) return "portfolio";
  return "generic";
}

type ProjectCapabilities = {
  hasRealUi: boolean;
  hasInternalNav: boolean;
  hasWorkingForm: boolean;
  hasLoginFlow: boolean;
  hasCartFlow: boolean;
  hasPersistence: boolean;
  hasResponsiveHints: boolean;
  hasLoadingStates: boolean;
};

function inferProjectCapabilities(ctx: GafcoreChatSuggestionContext): ProjectCapabilities {
  const code = allContent(ctx.files);
  return {
    hasRealUi: ctx.files.length >= 2 && !isWelcomeWorkspace(ctx) && code.length > 800,
    hasInternalNav:
      /#inicio|#contacto|id=["']contacto|id=["']inicio|setSection|setPage|activeSection|setView/i.test(
        code,
      ) || /href=["']#[^"']+["']/.test(code),
    hasWorkingForm:
      /<form[\s\S]*?onSubmit/i.test(code) ||
      (/onSubmit\s*=\s*\{/.test(code) && /preventDefault/.test(code)),
    hasLoginFlow:
      /iniciar sesi[oó]n|login|registrarse|signup|ingresar/i.test(code) &&
      (/type=["']password/i.test(code) || /correo|email/i.test(code)),
    hasCartFlow: /carrito|cart|addToCart|añadir al carrito|total.*precio/i.test(code),
    hasPersistence: /localStorage|sessionStorage/.test(code),
    hasResponsiveHints: /sm:|md:|lg:|max-w-|grid-cols-/i.test(code),
    hasLoadingStates: /loading|spinner|skeleton|isLoading|isSubmitting/i.test(code),
  };
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

function liveFunctionalGaps(ctx: GafcoreChatSuggestionContext): string[] {
  const tsx = ctx.files.filter((f) => /\.(tsx|jsx)$/i.test(f.name));
  if (tsx.length === 0) return [];
  const audit = auditFunctionalFirst(tsx);
  return audit.issues.filter((i) => i.severity === "error").map((i) => i.message);
}

function promptForValidationError(err: string): string | null {
  const e = err.toLowerCase();
  if (/formulario sin onsubmit|onsubmit conectado/i.test(e)) {
    return (
      "Corrige el error de validación en App.tsx. Conecta onSubmit en cada formulario (login, registro, contacto) con una función que haga e.preventDefault(), validación mínima y feedback visible. No elimines el diseño existente."
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

/** Checklist completa visible siempre (6 pasos estándar de creación de proyecto). */
function buildFullProjectChecklist(ctx: GafcoreChatSuggestionContext): GafcoreChatNextStep[] {
  const kind = detectProjectKind(ctx);
  const caps = inferProjectCapabilities(ctx);
  const gaps = liveFunctionalGaps(ctx);
  const err = (ctx.lastError ?? "").trim();
  const hasIntent = hasSubstantiveUserIntent(ctx.messages);
  const started = projectHasStarted(ctx);
  const hasAiBuild = ctx.messages.some((m) => m.role === "ai" && m.content.length > 80);

  const needsForms = /formulario|login|registr|contacto|ingresar|email|password/i.test(
    corpus(ctx),
  );
  const formGap =
    gaps.some((g) => /onsubmit|formulario/i.test(g)) ||
    /formulario sin onsubmit/i.test(err.toLowerCase());

  const defaultFormPrompt =
    "En todos los formularios (login, registro, contacto): añade onSubmit con e.preventDefault(), validación mínima y mensaje de éxito o error visible. No elimines el diseño actual.";

  const flowPrompt =
    kind === "ecommerce"
      ? "Implementa catálogo + carrito con estado, totales, addToCart y persistencia en localStorage."
      : kind === "saas" || caps.hasLoginFlow
        ? "Conecta login/registro/dashboard con useState: navegación interna, pantallas y handlers en botones."
        : "Conecta navegación y flujo principal: secciones con useState o anchors con acción, botones con handlers reales.";

  const items: Array<{ id: string; label: string; prompt: string; done: boolean }> = [
    {
      id: "guide-1",
      label: "1. Describe tu proyecto",
      done: hasIntent && (hasAiBuild || started),
      prompt:
        lastMessage(ctx.messages, "user").trim().length >= 20
          ? lastMessage(ctx.messages, "user").trim()
          : "Quiero crear una aplicación web para [negocio, usuarios y pantallas principales]. Incluye login, dashboard y diseño premium en dark mode.",
    },
    {
      id: "guide-2",
      label: "2. Generar base (App + preview)",
      done: started && caps.hasRealUi && hasAiBuild,
      prompt:
        "Construye la base completa del proyecto: App.tsx export default, main.tsx, index.html, diseño premium y flujo visible en el preview. Respeta lo que ya pedí en el chat.",
    },
    {
      id: "guide-3",
      label: "3. Formularios con onSubmit",
      done: needsForms ? caps.hasWorkingForm && !formGap : started && caps.hasRealUi,
      prompt: promptForValidationError(err) ?? defaultFormPrompt,
    },
    {
      id: "guide-4",
      label: "4. Flujo y navegación",
      done:
        caps.hasInternalNav ||
        (caps.hasLoginFlow && caps.hasPersistence) ||
        (started && !needsForms),
      prompt: flowPrompt,
    },
    {
      id: "guide-5",
      label: "5. Estados, loading y persistencia",
      done: caps.hasPersistence && caps.hasLoadingStates,
      prompt:
        "Añade useState + handlers en acciones clave; loading/isSubmitting en envíos; persiste datos en localStorage donde aplique.",
    },
    {
      id: "guide-6",
      label: "6. Responsive y publicar",
      done:
        caps.hasResponsiveHints &&
        (ctx.validationLabel?.includes("100") ||
          ctx.validationLabel?.includes("aprobado") ||
          (!formGap && gaps.length === 0 && caps.hasWorkingForm)),
      prompt:
        "QA final: responsive móvil/tablet/desktop, corrige errores del preview y deja el proyecto listo para publicar.",
    },
  ];

  if (formGap && err) {
    const fix = promptForValidationError(err);
    if (fix) {
      const formStep = items.find((i) => i.id === "guide-3");
      if (formStep) formStep.prompt = fix;
    }
  }

  if (/syntax|import|script error|react error/i.test(err)) {
    const fix = promptForValidationError(err);
    if (fix) {
      const syntaxInsert = {
        id: "guide-fix-now",
        label: "⚠ Corregir error ahora",
        prompt: fix,
        done: false,
      };
      return assignStepStatuses([syntaxInsert, ...items]);
    }
  }

  return assignStepStatuses(items);
}

/**
 * Guía completa visible en el IDE: checklist de creación + siguiente paso marcado.
 */
export function getGafcoreChatNextSteps(ctx: GafcoreChatSuggestionContext): GafcoreChatNextStep[] {
  return buildFullProjectChecklist(ctx);
}

/** Paso recomendado (chip resaltado). */
export function getRecommendedNextStep(steps: GafcoreChatNextStep[]): GafcoreChatNextStep | null {
  return steps.find((s) => s.status === "current") ?? steps.find((s) => s.status === "upcoming") ?? null;
}
