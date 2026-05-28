/**
 * Sugerencias «siguiente paso» del chat IDE (estilo Lovable): chips contextuales
 * según el proyecto, el último mensaje del usuario y el historial.
 */

import { isGafcoreDefaultTemplateApp } from "@/lib/gafcore-project-stale.shared";

export type GafcoreChatNextStep = {
  id: string;
  label: string;
  prompt: string;
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

const MAX_STEPS = 4;

/** Mínimo de intención en el chat antes de mostrar chips (proyecto aún no construido). */
const MIN_USER_INTENT_CHARS = 28;

const USER_INTENT_RE =
  /\b(quiero|necesito|crea|crear|genera|generar|construye|construir|app|aplicaci[oó]n|sitio|web|landing|taxi|tienda|dashboard|plataforma|formulario|reservas|ecommerce|saas)\b/i;

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

function fileNames(files: GafcoreChatSuggestionContext["files"]): string {
  return files.map((f) => f.name).join("\n").toLowerCase();
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

/** Área de trabajo aún en plantilla de bienvenida (preview «Bienvenidos a GafCore»). */
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

/** Proyecto real ya generado en el IDE (no pantalla de bienvenida). */
export function projectHasStarted(ctx: GafcoreChatSuggestionContext): boolean {
  return !isWelcomeWorkspace(ctx);
}

/** El usuario ya explicó en el chat de qué va el proyecto (antes del primer build). */
export function hasSubstantiveUserIntent(
  messages: GafcoreChatSuggestionContext["messages"],
): boolean {
  const text = allUserMessagesText(messages).trim();
  if (text.length < MIN_USER_INTENT_CHARS) return false;
  if (/^(hola|hi|hey|buenas|ok|vale|gracias)[!.?\s]*$/i.test(text)) return false;
  return USER_INTENT_RE.test(text) || text.length >= 72;
}

function isErrorRecoveryContext(ctx: GafcoreChatSuggestionContext): boolean {
  const blob = `${ctx.lastError ?? ""}\n${corpus(ctx)}`;
  return (
    Boolean(ctx.lastError?.trim()) ||
    /objects are not valid|react error #31|error #31|typeerror|syntaxerror|preview-error|failed to resolve|cannot assign to property/i.test(
      blob,
    )
  );
}

function pushStep(
  out: GafcoreChatNextStep[],
  id: string,
  label: string,
  prompt: string,
): void {
  if (out.length >= MAX_STEPS) return;
  if (out.some((s) => s.id === id)) return;
  const shortLabel = label.length > 36 ? `${label.slice(0, 33)}…` : label;
  out.push({ id, label: shortLabel, prompt });
}

/** Extrae viñetas accionables del último mensaje de la IA (como Lovable). */
function stepsFromAiBullets(aiText: string): GafcoreChatNextStep[] {
  const out: GafcoreChatNextStep[] = [];
  const lines = aiText.split(/\n/);
  for (const line of lines) {
    const m = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.+)$/);
    if (!m) continue;
    let text = m[1].trim();
    if (text.length < 12 || text.length > 140) continue;
    if (/^(listo|hecho|ok|perfecto|resumen)/i.test(text)) continue;
    text = text.replace(/\*\*/g, "").trim();
    const id = `ai-${out.length}-${text.slice(0, 12).replace(/\W/g, "")}`;
    pushStep(out, id, text.slice(0, 40), text.endsWith(".") ? text : `${text}.`);
    if (out.length >= 2) break;
  }
  return out;
}

type ProjectKind =
  | "taxi"
  | "restaurant"
  | "ecommerce"
  | "saas"
  | "portfolio"
  | "generic";

function detectProjectKind(ctx: GafcoreChatSuggestionContext): ProjectKind {
  const t = corpus(ctx);
  if (/taxi|conductor|pasajero|viaje activo|pedir un taxi|911|pánico|panico/i.test(t)) {
    return "taxi";
  }
  if (/restaurant|menú|menu|reserva mesa|platos/i.test(t)) return "restaurant";
  if (/checkout|carrito|producto|tienda|ecommerce|shop/i.test(t)) return "ecommerce";
  if (/dashboard|saas|suscripción|subscription|kpi/i.test(t)) return "saas";
  if (/portfolio|portafolio|proyectos destacados/i.test(t)) return "portfolio";
  return "generic";
}

/** Pasos según el tipo de app (taxi, tienda, etc.) — requieren intención conocida. */
function projectKindSteps(ctx: GafcoreChatSuggestionContext): GafcoreChatNextStep[] {
  const steps: GafcoreChatNextStep[] = [];
  const kind = detectProjectKind(ctx);

  if (kind === "taxi") {
    pushStep(
      steps,
      "taxi-911",
      "Llamada 911 desde pánico",
      "Activa la opción de llamar al 911 desde el botón de pánico e integra la acción con el registro de la alerta y el estado del viaje activo.",
    );
    pushStep(
      steps,
      "taxi-live-location",
      "Ubicación en vivo",
      "Añade compartir ubicación en vivo del viaje para pasajero y conductor con estado visible en la UI.",
    );
    pushStep(
      steps,
      "taxi-driver-panel",
      "Panel conductor",
      "Crea el panel del conductor: viajes disponibles, aceptar viaje, navegación simulada y estado en línea.",
    );
    pushStep(
      steps,
      "taxi-passenger-flow",
      "Flujo pedir taxi",
      "Completa el flujo de pedir taxi: origen, destino, estimación, confirmación y seguimiento del viaje.",
    );
    return steps;
  }

  if (kind === "restaurant") {
    pushStep(steps, "rest-menu", "Carta y platos", "Mejora la carta digital con categorías, fotos y precios.");
    pushStep(steps, "rest-reserve", "Reservar mesa", "Añade reserva de mesa con fecha, hora y confirmación.");
    return steps;
  }

  if (kind === "ecommerce") {
    pushStep(steps, "shop-catalog", "Catálogo productos", "Mejora el catálogo con filtros, fichas de producto y CTA comprar.");
    pushStep(steps, "shop-cart", "Carrito checkout", "Implementa carrito y checkout con resumen de pedido.");
    return steps;
  }

  if (kind === "saas") {
    pushStep(steps, "saas-dashboard", "Dashboard KPIs", "Refina el dashboard con KPIs, gráfico y tabla de actividad reciente.");
    pushStep(steps, "saas-onboarding", "Onboarding", "Añade onboarding de 3 pasos para nuevos usuarios.");
    return steps;
  }

  return steps;
}

/** Enriquecimiento solo cuando el proyecto ya tiene código real generado. */
function operationalEnrichmentSteps(ctx: GafcoreChatSuggestionContext): GafcoreChatNextStep[] {
  const steps: GafcoreChatNextStep[] = [];
  const code = allContent(ctx.files);
  const names = fileNames(ctx.files);
  const kind = detectProjectKind(ctx);

  if (!/useState|onClick|onSubmit|fetch\(|async\s+function/i.test(code)) {
    pushStep(
      steps,
      "op-interactivity",
      "Lógica interactiva",
      "Conecta botones y formularios con estado real (useState), validación y feedback al usuario.",
    );
  }
  if (!/loading|spinner|skeleton|isLoading/i.test(code)) {
    pushStep(
      steps,
      "op-loading",
      "Estados de carga",
      "Añade estados de carga y vacío en listas y formularios para que la app se sienta terminada.",
    );
  }
  if (!/nav|router|pathname|#\/|tabs|menu/i.test(names + code) && ctx.files.length >= 2) {
    pushStep(
      steps,
      "op-navigation",
      "Navegación completa",
      "Implementa navegación entre pantallas o secciones con rutas claras y menú coherente.",
    );
  }
  if (
    (kind === "generic" || kind === "portfolio") &&
    !/contact|contacto|form/i.test(names + code) &&
    /landing|sitio web|página web|contacto/i.test(corpus(ctx))
  ) {
    pushStep(
      steps,
      "add-contact",
      "Formulario contacto",
      "Añade formulario de contacto funcional con validación y mensaje de éxito o error.",
    );
  }
  if (!/responsive|sm:|md:|lg:/i.test(code)) {
    pushStep(
      steps,
      "responsive",
      "Responsive móvil",
      "Haz el layout totalmente responsive en móvil, tablet y desktop.",
    );
  }
  if (kind === "taxi" && !/911|pánico|panico|alerta/i.test(code)) {
    pushStep(
      steps,
      "taxi-safety",
      "Seguridad y alertas",
      "Completa flujo de seguridad: botón de pánico, registro de alerta y estado del viaje activo.",
    );
  }

  return steps;
}

function projectContextSteps(ctx: GafcoreChatSuggestionContext): GafcoreChatNextStep[] {
  const steps = projectKindSteps(ctx);
  for (const s of operationalEnrichmentSteps(ctx)) {
    pushStep(steps, s.id, s.label, s.prompt);
  }
  return steps;
}

export function getGafcoreChatNextSteps(ctx: GafcoreChatSuggestionContext): GafcoreChatNextStep[] {
  /** Sin chips hasta que el preview deje de ser la plantilla de bienvenida. */
  if (!projectHasStarted(ctx)) return [];

  const steps: GafcoreChatNextStep[] = [];
  const empty = ctx.messages.length === 0;
  const lastAi = lastMessage(ctx.messages, "ai");
  const lastUser = lastMessage(ctx.messages, "user");
  const recentUser = lastUser.toLowerCase();
  const pipeline = (ctx.pipelineStatus ?? "").toLowerCase();
  const validation = (ctx.validationLabel ?? "").toLowerCase();

  if (isErrorRecoveryContext(ctx)) {
    const err = (ctx.lastError ?? lastAi).slice(0, 500);
    pushStep(
      steps,
      "fix-runtime",
      "Arreglar error preview",
      `Arregla este error de preview sin romper lo ya construido. NUNCA renderices objetos en JSX — usa campos (.title, .label) o JSX dentro del .map:\n\n\`\`\`\n${err}\n\`\`\``,
    );
    pushStep(
      steps,
      "fix-jsx-map",
      "Corregir map JSX",
      "Revisa todos los .map(): devuelve JSX con campos del objeto (p. ej. item.title), nunca {item} ni {item.icon} sin componente.",
    );
    pushStep(steps, "explain-error", "Explicar el error", "Explica en español qué causa este error y qué archivos tocar.");
    pushStep(
      steps,
      "continue-feature",
      "Seguir con la app",
      "Cuando el error esté corregido, continúa con la siguiente función que pedí en el chat.",
    );
    return steps.slice(0, MAX_STEPS);
  }

  if (empty && ctx.files.length > 0) {
    return projectContextSteps(ctx).slice(0, MAX_STEPS);
  }

  for (const s of stepsFromAiBullets(lastAi)) {
    pushStep(steps, s.id, s.label, s.prompt);
  }

  if (/deploy pendiente|sin publicar|publicar/i.test(pipeline)) {
    pushStep(steps, "publish", "Publicar sitio", "Prepara el proyecto para publicar en web y dime qué falta.");
  }

  if (/fábrica|fabrica|factory/.test(pipeline) && /\d+\/100/.test(pipeline)) {
    const scoreMatch = pipeline.match(/(\d+)\/100/);
    const score = scoreMatch ? Number(scoreMatch[1]) : 100;
    if (score < 94) {
      pushStep(
        steps,
        "factory-design-polish",
        "Pulir diseño premium",
        "[modo profundo] Aplica mejoras de diseño premium: hero más impactante, tipografía, espaciado y micro-interacciones.",
      );
    }
  }

  if (
    /rls|row level|supabase|política|policy|policies|permiso|realtime|auth\.|anon/i.test(
      `${recentUser}\n${lastAi}`.toLowerCase(),
    )
  ) {
    pushStep(
      steps,
      "sec-rls",
      "Verificar seguridad RLS",
      "Revisa las políticas RLS de Supabase: qué tablas exponen datos y propón políticas seguras.",
    );
    pushStep(
      steps,
      "sec-public-views",
      "Vistas públicas seguras",
      "Configura vistas públicas o RPC seguras para datos que el front necesita sin abrir tablas sensibles.",
    );
  }

  const userAskedDesign =
    /diseño|design|hero|ui|ux|visual|tipograf|animac/i.test(recentUser) &&
    !/error|react|preview|arregl|fix/i.test(recentUser);

  if (userAskedDesign) {
    pushStep(
      steps,
      "design-audit",
      "Auditar diseño",
      "Audita el diseño actual: jerarquía visual, contraste, espaciado y consistencia de componentes.",
    );
    pushStep(
      steps,
      "design-animations",
      "Añadir animaciones",
      "Añade animaciones sutiles (hover, entrada de secciones) sin afectar rendimiento.",
    );
  }

  if (ctx.visualEditOn) {
    pushStep(
      steps,
      "visual-only",
      "Solo ediciones visuales",
      "Aplica solo cambios visuales (colores, tipografía, espaciado, hover). No cambies lógica, rutas ni datos.",
    );
  }

  for (const s of projectContextSteps(ctx)) {
    pushStep(steps, s.id, s.label, s.prompt);
  }

  if (ctx.mode === "chat") {
    pushStep(
      steps,
      "chat-to-build",
      "Generar código",
      "Implementa en código lo que acabamos de acordar en el chat.",
    );
  }

  if (validation && /bajo|warn|mejorar|\d{1,2}\//i.test(validation)) {
    pushStep(
      steps,
      "fix-validation",
      "Subir puntuación",
      "Corrige los problemas de validación detectados y sube la puntuación de calidad.",
    );
  }

  if (steps.length === 0) {
    const fallback = projectContextSteps(ctx);
    if (fallback.length > 0) return fallback.slice(0, MAX_STEPS);
    return [
      {
        id: "continue-build",
        label: "Continuar lo anterior",
        prompt: lastUser.trim()
          ? `Continúa con esto: ${lastUser.trim().slice(0, 200)}`
          : "Continúa mejorando el proyecto según el último cambio que pedí.",
      },
      {
        id: "fb-polish",
        label: "Pulir detalles",
        prompt: "Pulir detalles finales: hover states, transiciones y consistencia de botones.",
      },
    ].slice(0, MAX_STEPS);
  }

  return steps.slice(0, MAX_STEPS);
}
