import type { AgentType } from "@/tasks/types";
import { buildGafcorePromptMasterBriefAppend } from "@/lib/gafcore-prompt-master-brief.shared";

export type AgentCapability = {
  type: AgentType;
  label: string;
  role: string;
  responsibilities: string[];
  qualityBar: string[];
  skills: string[];
  canWriteFiles: boolean;
  maxRetries: number;
  defaultPriority: "critical" | "high" | "normal" | "low";
  defaultAllow: string[];
  defaultDeny: string[];
};

export const AGENT_REGISTRY: Record<AgentType, AgentCapability> = {
  planner: {
    type: "planner",
    label: "Arquitecto de producto",
    role: "Convierte el pedido en una arquitectura clara, etapas de entrega y dependencias realistas.",
    responsibilities: [
      "Definir alcance, pantallas, flujos y datos antes de escribir codigo.",
      "Separar MVP funcional de mejoras visuales o integraciones posteriores.",
      "Evitar planes genericos: cada tarea debe tener salida verificable.",
    ],
    qualityBar: [
      "El plan permite construir una experiencia completa, no solo una maqueta.",
      "Cada tarea tiene owner, dependencia y criterio de terminado.",
    ],
    skills: ["product-brief", "information-architecture", "workflow-design"],
    canWriteFiles: false,
    maxRetries: 1,
    defaultPriority: "critical",
    defaultAllow: [],
    defaultDeny: ["**"],
  },
  frontend: {
    type: "frontend",
    label: "Frontend UX/UI premium",
    role: "Construye interfaces React/Tailwind profesionales, responsive y operativas.",
    responsibilities: [
      "Crear layout visual de alta fidelidad con jerarquia, estados y componentes completos.",
      "Conectar handlers, formularios, filtros, navegacion local y persistencia cuando aplique.",
      "Mantener imports, tipos y rutas coherentes con el proyecto.",
    ],
    qualityBar: [
      "La primera pantalla debe verse como producto real y transmitir la vertical del negocio.",
      "Cada boton y formulario principal debe hacer algo visible.",
      "Mobile y desktop deben quedar intencionalmente disenados.",
    ],
    skills: ["visual-polish", "responsive-layout", "functional-react", "conversion-copy"],
    canWriteFiles: true,
    maxRetries: 1,
    defaultPriority: "normal",
    defaultAllow: ["App.tsx", "main.tsx", "index.html", "styles.css", "src/components/**", "src/routes/**", "src/styles.css", "src/**/*.css"],
    defaultDeny: ["supabase/**", "src/lib/**"],
  },
  backend: {
    type: "backend",
    label: "Backend e integraciones",
    role: "Disena APIs, server functions e integraciones sin exponer secretos.",
    responsibilities: [
      "Crear contratos de API, validaciones y manejo de errores.",
      "Integrar servicios externos solo cuando el pedido lo requiere.",
      "Mantener secretos en servidor y evitar variables VITE sensibles.",
    ],
    qualityBar: [
      "Cada endpoint tiene validacion de entrada y respuesta consistente.",
      "Las integraciones fallan de forma explicable para el usuario.",
    ],
    skills: ["api-design", "server-functions", "secure-env", "webhooks"],
    canWriteFiles: true,
    maxRetries: 1,
    defaultPriority: "normal",
    defaultAllow: ["src/lib/**", "src/routes/api/**", "src/server.ts"],
    defaultDeny: ["supabase/migrations/**"],
  },
  database: {
    type: "database",
    label: "Supabase y datos",
    role: "Modela tablas, relaciones, RLS y persistencia con seguridad por defecto.",
    responsibilities: [
      "Proponer tablas, indices, policies RLS y seed data segun el flujo.",
      "Separar cambios de base de datos de cambios visuales.",
      "No asumir service role en cliente.",
    ],
    qualityBar: [
      "Las policies evitan fuga entre usuarios.",
      "El modelo soporta CRUD real y estados del negocio.",
    ],
    skills: ["supabase-auth", "rls-policies", "data-modeling", "storage"],
    canWriteFiles: true,
    maxRetries: 0,
    defaultPriority: "high",
    defaultAllow: ["supabase/migrations/**"],
    defaultDeny: ["src/**"],
  },
  validation: {
    type: "validation",
    label: "QA y Build Doctor",
    role: "Revisa sintaxis, preview, funcionalidad, accesibilidad y regresiones antes de entregar.",
    responsibilities: [
      "Detectar errores TSX, imports rotos, componentes sin export y handlers vacios.",
      "Revisar flujo funcional end-to-end: clic, estado, feedback, persistencia.",
      "Bloquear salidas que no compilan o que no cumplen el pedido.",
    ],
    qualityBar: [
      "No se entrega un proyecto que solo parece listo: debe operar.",
      "Los errores se convierten en instrucciones de reparacion concretas.",
    ],
    skills: ["build-repair", "functional-audit", "accessibility-check", "preview-smoke"],
    canWriteFiles: false,
    maxRetries: 0,
    defaultPriority: "high",
    defaultAllow: [],
    defaultDeny: ["**"],
  },
  deployment: {
    type: "deployment",
    label: "Deploy y produccion",
    role: "Prepara publicacion, variables, GitHub, Vercel, health checks y rollback seguro.",
    responsibilities: [
      "Verificar integraciones requeridas antes de publicar.",
      "Listar variables sin revelar secretos.",
      "Confirmar health y dominio despues del deploy.",
    ],
    qualityBar: [
      "Produccion debe quedar verificable con health checks.",
      "Nunca rompe Supabase ni pisa variables existentes.",
    ],
    skills: ["vercel-deploy", "github-sync", "env-audit", "rollback-plan"],
    canWriteFiles: false,
    maxRetries: 1,
    defaultPriority: "low",
    defaultAllow: [],
    defaultDeny: ["**"],
  },
  documentation: {
    type: "documentation",
    label: "Documentacion de producto",
    role: "Documenta decisiones, uso, instalacion y siguientes pasos con lenguaje claro.",
    responsibilities: [
      "Crear README, notas de uso y checklist de operacion.",
      "Explicar integraciones y variables sin revelar secretos.",
    ],
    qualityBar: [
      "La documentacion permite a otro usuario continuar el proyecto.",
    ],
    skills: ["readme", "handoff-notes", "operator-guide"],
    canWriteFiles: true,
    maxRetries: 1,
    defaultPriority: "low",
    defaultAllow: ["docs/**", "README.md"],
    defaultDeny: ["src/**"],
  },
  refactor: {
    type: "refactor",
    label: "Refactor y arquitectura",
    role: "Reduce complejidad y duplicacion sin cambiar comportamiento visible.",
    responsibilities: [
      "Extraer componentes solo cuando mejora legibilidad o reuse real.",
      "Mantener contratos y estilos existentes.",
      "No mezclar refactor con features no pedidas.",
    ],
    qualityBar: [
      "El diff mejora mantenibilidad y conserva la experiencia.",
    ],
    skills: ["component-extraction", "state-simplification", "code-health"],
    canWriteFiles: true,
    maxRetries: 1,
    defaultPriority: "normal",
    defaultAllow: ["src/**"],
    defaultDeny: ["supabase/**"],
  },
  debug: {
    type: "debug",
    label: "Debugger sistemico",
    role: "Encuentra causa raiz, aplica fixes pequenos y agrega regresiones cuando es posible.",
    responsibilities: [
      "Reproducir el error antes de tocar codigo cuando haya informacion suficiente.",
      "Corregir causa raiz, no solo el sintoma visible.",
      "Agregar smoke test o guardrail para que no vuelva.",
    ],
    qualityBar: [
      "El fix explica que rompia, que cambio y como se verifico.",
    ],
    skills: ["root-cause-analysis", "regression-test", "runtime-diagnostics"],
    canWriteFiles: true,
    maxRetries: 2,
    defaultPriority: "critical",
    defaultAllow: ["src/**"],
    defaultDeny: ["supabase/migrations/**"],
  },
};

export type ProfessionalSkill = {
  id: string;
  label: string;
  category: "visual" | "product" | "operations" | "data" | "commerce" | "deploy";
  trigger: RegExp;
  agents: AgentType[];
  instructions: string[];
  deliverables: string[];
};

export const PROFESSIONAL_SKILLS: ProfessionalSkill[] = [
  {
    id: "landing-profesional",
    label: "Landing profesional",
    category: "visual",
    trigger: /landing|pagina|p[aá]gina|home|hero|barber|barberia|barber[ií]a|salon|marca|servicio/i,
    agents: ["planner", "frontend", "validation"],
    instructions: [
      "Primera pantalla con identidad clara del negocio, CTA principal y prueba visual de la oferta.",
      "Secciones minimas: hero, beneficios, servicios/features, prueba social, CTA final y contacto.",
      "Usar imagen/mockup realista segun vertical; no dejar placeholder generico.",
    ],
    deliverables: ["App.tsx funcional", "responsive mobile/desktop", "CTA y formulario o contacto operativo"],
  },
  {
    id: "saas-dashboard",
    label: "SaaS dashboard",
    category: "operations",
    trigger: /saas|dashboard|panel|analytics|metricas|m[eé]tricas|crm|admin|operativo/i,
    agents: ["planner", "frontend", "backend", "validation"],
    instructions: [
      "Priorizar densidad utilitaria: sidebar/nav, KPIs, tablas, filtros, estados vacios y acciones repetibles.",
      "Cada vista debe tener flujo de usuario claro, no solo tarjetas decorativas.",
      "Usar datos demo coherentes y persistencia local si no hay backend real.",
    ],
    deliverables: ["navegacion local", "tablas/filtros accionables", "estados loading/error/vacio"],
  },
  {
    id: "ecommerce",
    label: "E-commerce",
    category: "commerce",
    trigger: /tienda|e-?commerce|catalogo|cat[aá]logo|producto|carrito|checkout|venta|precio|barberia.*servicio/i,
    agents: ["planner", "frontend", "backend", "validation"],
    instructions: [
      "Catalogo con productos/servicios, filtros o categorias, carrito y total.",
      "Botones de compra/reserva conectados a estado visible.",
      "Persistir carrito o seleccion en localStorage si no hay backend.",
    ],
    deliverables: ["catalogo", "carrito funcional", "totales y feedback visible"],
  },
  {
    id: "booking-reservas",
    label: "Reservas y citas",
    category: "operations",
    trigger: /reserva|reservas|cita|citas|agenda|booking|calendario|horario/i,
    agents: ["planner", "frontend", "database", "validation"],
    instructions: [
      "Flujo cerrado: elegir servicio, fecha/hora, datos de cliente y confirmacion.",
      "Validar campos y mostrar estado de exito/error.",
      "Si no hay Supabase listo, persistir reservas demo en localStorage.",
    ],
    deliverables: ["formulario de reserva", "validacion", "confirmacion y listado de citas"],
  },
  {
    id: "supabase-auth-db",
    label: "Supabase auth y datos",
    category: "data",
    trigger: /supabase|login|registro|auth|base de datos|database|tabla|rls|storage/i,
    agents: ["planner", "database", "backend", "validation"],
    instructions: [
      "Separar UI cliente de secretos servidor.",
      "Modelar tablas y RLS antes de crear queries.",
      "Mantener fallback local si la migracion no se puede aplicar automaticamente.",
    ],
    deliverables: ["modelo de datos", "policies RLS", "UI conectada o fallback claro"],
  },
  {
    id: "stripe-billing",
    label: "Stripe billing",
    category: "commerce",
    trigger: /stripe|pago|pagos|suscripcion|suscripción|checkout|factura|billing/i,
    agents: ["planner", "backend", "frontend", "validation"],
    instructions: [
      "Separar public key y secret key; nunca enviar secretos al cliente.",
      "Crear flujo checkout claro con estados de pago pendiente/exitoso/error.",
      "Documentar variables requeridas sin mostrar valores.",
    ],
    deliverables: ["flujo checkout", "estado de pago", "env checklist"],
  },
  {
    id: "visual-polish",
    label: "Pulido visual premium",
    category: "visual",
    trigger: /premium|profesional|bonito|moderno|visual|dise[ñn]o|figma|lovable|mejor|pro/i,
    agents: ["frontend", "validation"],
    instructions: [
      "Elevar jerarquia visual, espaciado, tipografia, contraste y estados interactivos.",
      "Evitar UI generica de una sola paleta; cada vertical debe sentirse especifica.",
      "Revisar que textos no se encimen y que las tarjetas no parezcan plantilla basica.",
    ],
    deliverables: ["layout pulido", "responsive", "microcopy profesional"],
  },
  {
    id: "deploy-production",
    label: "Deploy produccion",
    category: "deploy",
    trigger: /deploy|publicar|produccion|producción|vercel|github|dominio|lanzar/i,
    agents: ["deployment", "validation", "documentation"],
    instructions: [
      "Verificar build, variables, GitHub/Vercel y health antes de decir publicado.",
      "No tocar variables existentes salvo instruccion explicita.",
      "Preparar rollback o checklist si algo falla.",
    ],
    deliverables: ["build verificado", "deploy verificado", "health check"],
  },
  {
    id: "prompt-master",
    label: "Prompt Master",
    category: "product",
    trigger: /prompt[-\s]?master|prompt\s+para|mejora.*prompt|optimiza.*prompt|ingenier[ií]a\s+de\s+prompts|lovable|cursor|claude\s+code|chatgpt|gemini|midjourney|sora|v0|bolt/i,
    agents: ["planner", "documentation", "validation"],
    instructions: [
      "Detectar la herramienta destino antes de escribir el prompt: GafCore, Lovable, Cursor, Claude, ChatGPT, Gemini, imagen/video o agente autonomo.",
      "Extraer tarea, contexto, formato de salida, restricciones, criterios de exito, ejemplos y limites de alcance.",
      "Producir prompts compactos: cada palabra debe cambiar el resultado; no rellenar con teoria.",
      "Para agentes de codigo, incluir estado inicial, archivos permitidos, no tocar, criterios de terminado y stop conditions.",
      "Para builds en GafCore, usar esta skill como brief interno; si el usuario pidio construir, seguir entregando codigo en files[].",
    ],
    deliverables: ["prompt listo para pegar", "criterios de exito", "restricciones y stop conditions"],
  },
];

export function selectProfessionalSkills(instruction: string): ProfessionalSkill[] {
  const picked = PROFESSIONAL_SKILLS.filter((skill) => skill.trigger.test(instruction));
  if (/\b(calzado|tenis|zapato|zapatos|zapatilla|zapatillas|sneaker|sneakers|shoe|shoes)\b/i.test(instruction)) {
    const ecommerce = PROFESSIONAL_SKILLS.find((skill) => skill.id === "ecommerce");
    if (ecommerce && !picked.some((skill) => skill.id === ecommerce.id)) {
      picked.push(ecommerce);
    }
  }
  const ids = new Set<string>();
  return picked.filter((skill) => {
    if (ids.has(skill.id)) return false;
    ids.add(skill.id);
    return true;
  });
}

export function isPromptMasterRequest(instruction: string): boolean {
  return /prompt[-\s]?master|prompt\s+para|mejora.*prompt|optimiza.*prompt|arregla.*prompt|hazme\s+un\s+prompt|escribe\s+un\s+prompt|ingenier[ií]a\s+de\s+prompts/i.test(
    instruction,
  );
}

export function buildPromptMasterPromptAppend(instruction: string): string {
  const promptOnly = isPromptMasterRequest(instruction);
  return [
    "\n[PROMPT MASTER GAFCORE]",
    "Aplica una capa de ingenieria de prompts antes de responder.",
    "Pipeline:",
    "1. Detecta herramienta destino. Si no esta clara y el usuario solo pidio un prompt, pregunta maximo 3 datos criticos.",
    "2. Extrae: tarea, herramienta, formato de salida, restricciones, input, contexto, audiencia, criterios de exito y ejemplos.",
    "3. Elige estructura simple: rol + tarea + contexto + restricciones + formato + done-when. Evita marcos complejos si no aportan.",
    "4. Para Lovable/v0/Bolt/GafCore: especifica stack, pantallas, datos, interacciones, estilos, responsive y que NO debe agregar.",
    "5. Para Cursor/Claude Code/agentes: incluye archivos permitidos, archivos prohibidos, pasos, pruebas, stop conditions y no tocar secretos.",
    "6. Para modelos de razonamiento: no pidas chain-of-thought visible; solicita solo respuesta final.",
    promptOnly
      ? "Modo prompt: devuelve files: [] y en reply entrega un solo prompt copiable, sin teoria extensa."
      : "Modo build: usa esto solo como brief interno; si el usuario pidio construir, files[] debe contener el codigo.",
  ].join("\n");
}

export function buildProfessionalAgentPromptAppend(instruction: string): string {
  const skills = selectProfessionalSkills(instruction);
  const promptMasterBrief = buildGafcorePromptMasterBriefAppend(instruction);
  const shoeCommerce = /\b(calzado|tenis|zapato|zapatos|zapatilla|zapatillas|sneaker|sneakers|shoe|shoes)\b/i.test(
    instruction,
  );
  const activeAgentTypes = new Set<AgentType>([
    "planner",
    "frontend",
    "validation",
    ...skills.flatMap((skill) => skill.agents),
  ]);
  const activeAgents = [...activeAgentTypes].map((type) => AGENT_REGISTRY[type]);

  const agentLines = activeAgents.map((agent) => {
    return [
      `- ${agent.label} (${agent.type}): ${agent.role}`,
      `  Responsabilidades: ${agent.responsibilities.join(" | ")}`,
      `  Calidad: ${agent.qualityBar.join(" | ")}`,
    ].join("\n");
  });

  const skillLines = skills.length > 0
    ? skills.map((skill) => {
        return [
          `- ${skill.label} [${skill.id}]`,
          `  Instrucciones: ${skill.instructions.join(" | ")}`,
          `  Entregables: ${skill.deliverables.join(" | ")}`,
        ].join("\n");
      })
    : [
        "- Build profesional base",
        "  Instrucciones: interpretar alcance, construir UI funcional, validar preview y no entregar placeholders.",
        "  Entregables: App funcional, responsive, con handlers reales y sin errores de build.",
      ];

  const contextualQualityLines = shoeCommerce
    ? [
        "Reglas especificas para tienda de tenis/calzado:",
        "- La primera pantalla debe vender tenis/sneakers de forma evidente: hero comercial, colecciones, beneficios y CTA de compra.",
        "- Productos con nombres reales y diferenciados; prohibido Modelo A, Producto A, Item 1 o copy de relleno.",
        "- Debe incluir tallas, colores, precios, filtros/categorias, reviews o rating, envio/devoluciones y carrito con total.",
        "- Imagenes/mockups de producto deben coincidir con tenis/calzado; prohibido picsum, paisajes, montanas, waterfalls o imagenes aleatorias.",
      ]
    : [];

  return [
    "\n[ORQUESTADOR PROFESIONAL GAFCORE]",
    "Actua como un equipo de agentes especializados antes de escribir archivos. No expliques el debate interno; aplicalo en el codigo final.",
    "Agentes activos:",
    ...agentLines,
    "Skills activas:",
    ...skillLines,
    promptMasterBrief,
    "Protocolo obligatorio:",
    "1. Arquitecto: define pantallas, datos y flujo del usuario.",
    "2. UX/UI: convierte el brief en una experiencia visual especifica de la industria.",
    "3. Frontend/Backend/Datos: implementa solo lo necesario, con handlers reales y persistencia local o Supabase segun contexto.",
    "4. QA/Build Doctor: revisa sintaxis TSX, imports, botones, formularios, responsive y estados vacios antes de responder.",
    "5. Entrega solo JSON con archivos delta completos; si el usuario pidio construir, files no puede quedar vacio.",
    ...contextualQualityLines,
  ].join("\n");
}

export function buildPlannerAgentCatalogPrompt(): string {
  return [
    "Catalogo de agentes GafCore disponibles:",
    ...Object.values(AGENT_REGISTRY).map((agent) => {
      return `- ${agent.type}: ${agent.label}. Usa este agente para: ${agent.responsibilities.join(" | ")}`;
    }),
    "Skills profesionales disponibles:",
    ...PROFESSIONAL_SKILLS.map((skill) => {
      return `- ${skill.id}: ${skill.label}. Agentes sugeridos: ${skill.agents.join(", ")}. Entregables: ${skill.deliverables.join(", ")}`;
    }),
  ].join("\n");
}

export function buildAgentExecutionPrompt(agentType: AgentType): string {
  const agent = AGENT_REGISTRY[agentType];
  return [
    `[Perfil de agente: ${agent.label}]`,
    agent.role,
    `Responsabilidades: ${agent.responsibilities.join(" | ")}`,
    `Skills: ${agent.skills.join(", ")}`,
    `Barra de calidad: ${agent.qualityBar.join(" | ")}`,
    "Entrega codigo solo dentro de los archivos permitidos por la tarea y no salgas de tu ambito.",
  ].join("\n");
}
