/**
 * Sugerencias «siguiente paso» del chat IDE (estilo Lovable): chips contextuales
 * encima del compositor según historial, archivos y estado del pipeline.
 */

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

const STARTER_STEPS: GafcoreChatNextStep[] = [
  {
    id: "starter-landing",
    label: "Landing moderna",
    prompt: "Crea una landing moderna con hero, beneficios y CTA.",
  },
  {
    id: "starter-contact",
    label: "Formulario contacto",
    prompt: "Agrega un formulario de contacto con validación y estados de envío.",
  },
  {
    id: "starter-dashboard",
    label: "Dashboard con tarjetas",
    prompt: "Diseña un dashboard con tarjetas KPI, gráfico simple y tabla.",
  },
  {
    id: "starter-dark",
    label: "Modo oscuro",
    prompt: "Convierte la UI a modo oscuro usando tokens semánticos de Tailwind.",
  },
];

function lastMessage(
  messages: GafcoreChatSuggestionContext["messages"],
  role: "user" | "ai",
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === role) return messages[i]?.content ?? "";
  }
  return "";
}

function fileNames(files: GafcoreChatSuggestionContext["files"]): string {
  return files.map((f) => f.name).join("\n").toLowerCase();
}

function allContent(files: GafcoreChatSuggestionContext["files"]): string {
  return files.map((f) => f.content).join("\n").toLowerCase();
}

function pushStep(
  out: GafcoreChatNextStep[],
  id: string,
  label: string,
  prompt: string,
): void {
  if (out.length >= MAX_STEPS) return;
  if (out.some((s) => s.id === id)) return;
  out.push({ id, label, prompt });
}

export function getGafcoreChatNextSteps(ctx: GafcoreChatSuggestionContext): GafcoreChatNextStep[] {
  const steps: GafcoreChatNextStep[] = [];
  const empty = ctx.messages.length === 0;
  const lastAi = lastMessage(ctx.messages, "ai");
  const lastUser = lastMessage(ctx.messages, "user");
  const recentText = `${lastAi}\n${lastUser}`.toLowerCase();
  const names = fileNames(ctx.files);
  const code = allContent(ctx.files);
  const pipeline = (ctx.pipelineStatus ?? "").toLowerCase();
  const validation = (ctx.validationLabel ?? "").toLowerCase();

  if (empty) {
    return STARTER_STEPS.slice(0, MAX_STEPS);
  }

  if (ctx.lastError?.trim()) {
    const err = ctx.lastError.slice(0, 400);
    pushStep(
      steps,
      "fix-build-error",
      "Arreglar error de build",
      `Arregla este error de build sin romper lo que ya funciona:\n\n\`\`\`\n${err}\n\`\`\``,
    );
    pushStep(steps, "explain-error", "Explicar el error", "Explica en español qué causa este error y cómo evitarlo.");
    pushStep(steps, "review-app", "Revisar App.tsx", "Revisa App.tsx y corrige imports, JSX y rutas rotas.");
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
    pushStep(
      steps,
      "factory-validate",
      "Validar calidad",
      "Ejecuta una revisión de calidad: accesibilidad, responsive, tokens semánticos y sin placeholders.",
    );
  }

  if (/rls|row level|seguridad|supabase|política|policy|policies|permiso|realtime|auth\.|anon/i.test(recentText)) {
    pushStep(
      steps,
      "sec-rls",
      "Verificar seguridad RLS",
      "Revisa las políticas RLS de Supabase: qué tablas exponen datos y propón políticas seguras.",
    );
    pushStep(
      steps,
      "sec-public-views",
      "Usar vistas públicas",
      "Configura vistas públicas o RPC seguras para datos que el front necesita sin abrir tablas sensibles.",
    );
    pushStep(
      steps,
      "sec-realtime",
      "Probar permisos realtime",
      "Comprueba permisos de Realtime y suscripciones: qué puede leer un usuario anónimo vs autenticado.",
    );
    pushStep(
      steps,
      "sec-anon",
      "Validar acceso anónimo",
      "Valida el acceso anónimo: rutas, lecturas y escrituras permitidas sin sesión.",
    );
  }

  if (/diseño|design|crítica|critique|visual|ui|ux|hero|tipograf/i.test(recentText)) {
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

  if (ctx.mode === "chat") {
    pushStep(
      steps,
      "chat-to-build",
      "Generar código",
      "Implementa en código lo que acabamos de acordar en el chat.",
    );
  }

  if (ctx.factoryMode && !/completado|listo/i.test(pipeline)) {
    pushStep(
      steps,
      "factory-run",
      "Ejecutar Modo Fábrica",
      "Ejecuta Modo Fábrica: plan, código, validación y crítica de diseño en un solo flujo.",
    );
  }

  if (ctx.visualEditOn) {
    pushStep(
      steps,
      "visual-polish",
      "Refinar estilos UI",
      "Refina solo estilos y layout: colores con tokens semánticos, espaciado y tipografía.",
    );
  } else if (ctx.files.length > 0) {
    pushStep(
      steps,
      "visual-toggle",
      "Solo ediciones visuales",
      "Activa ediciones visuales y mejora la UI sin cambiar la lógica de negocio.",
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

  if (!/dark|oscuro|theme-dark|\.dark/i.test(code) && ctx.files.length > 2) {
    pushStep(steps, "dark-mode", "Modo oscuro", "Añade modo oscuro con tokens semánticos y un toggle en el header.");
  }

  if (!/contact|contacto|form/i.test(names + code) && ctx.files.length > 1) {
    pushStep(
      steps,
      "add-contact",
      "Formulario contacto",
      "Añade una sección de contacto con formulario accesible y feedback de envío.",
    );
  }

  if (!/responsive|sm:|md:|lg:|mobile/i.test(code) && ctx.files.length > 2) {
    pushStep(steps, "responsive", "Hacer responsive", "Haz el layout totalmente responsive en móvil, tablet y desktop.");
  }

  if (!/meta name|og:|seo|description/i.test(code) && ctx.files.length > 2) {
    pushStep(steps, "seo", "Mejorar SEO", "Añade meta title, description, Open Graph y estructura semántica para SEO.");
  }

  if (ctx.multiAgentMode && ctx.files.length > 0) {
    pushStep(
      steps,
      "workflow-next",
      "Siguiente tarea workflow",
      "Propón la siguiente tarea del workflow multiagente según el estado actual del proyecto.",
    );
  }

  if (steps.length < MAX_STEPS) {
    pushStep(
      steps,
      "improve-copy",
      "Mejorar textos",
      "Mejora los textos de la UI: titulares más claros, CTAs persuasivos y tono profesional.",
    );
  }
  if (steps.length < MAX_STEPS) {
    pushStep(
      steps,
      "add-tests",
      "Revisar accesibilidad",
      "Revisa accesibilidad: labels, contraste, foco de teclado y roles ARIA.",
    );
  }

  if (steps.length === 0) {
    return FOLLOWUP_FALLBACK.slice(0, MAX_STEPS);
  }

  return steps.slice(0, MAX_STEPS);
}

const FOLLOWUP_FALLBACK: GafcoreChatNextStep[] = [
  {
    id: "fb-responsive",
    label: "Hacer responsive",
    prompt: "Haz responsive el layout principal y corrige desbordes en móvil.",
  },
  {
    id: "fb-design",
    label: "Mejorar diseño",
    prompt: "Mejora el diseño visual: jerarquía, espaciado y componentes más premium.",
  },
  {
    id: "fb-dark",
    label: "Modo oscuro",
    prompt: "Convierte la interfaz a modo oscuro con tokens semánticos.",
  },
  {
    id: "fb-polish",
    label: "Pulir detalles",
    prompt: "Pulir detalles finales: hover states, transiciones y consistencia de botones.",
  },
];
