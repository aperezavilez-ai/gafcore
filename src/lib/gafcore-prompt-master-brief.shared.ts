export type GafcoreBriefType =
  | "ecommerce"
  | "saas"
  | "dashboard"
  | "booking"
  | "restaurant"
  | "landing"
  | "marketplace"
  | "directory"
  | "education"
  | "events"
  | "real-estate"
  | "logistics"
  | "pos"
  | "analytics"
  | "ai-tool"
  | "community"
  | "nonprofit"
  | "government"
  | "multi-step-form"
  | "map-app"
  | "portfolio"
  | "blog"
  | "mobile-app"
  | "business-app"
  | "generic";

export type GafcoreBriefIntent = {
  projectType: GafcoreBriefType;
  vertical: string;
  subject: string;
  physicalProduct: boolean;
  style: string;
  palette: string[];
  effects: string[];
  requiredSections: string[];
  requiredInteractions: string[];
  dataModel: string[];
  mediaRules: string[];
  qualityChecks: string[];
};

const COLOR_WORDS: Record<string, string> = {
  azul: "azul",
  blue: "azul",
  rojo: "rojo",
  red: "rojo",
  verde: "verde",
  green: "verde",
  negro: "negro",
  black: "negro",
  blanco: "blanco",
  white: "blanco",
  dorado: "dorado",
  gold: "dorado",
  morado: "morado",
  purple: "morado",
  rosa: "rosa",
  pink: "rosa",
  naranja: "naranja",
  orange: "naranja",
  amarillo: "amarillo",
  yellow: "amarillo",
  gris: "gris",
  gray: "gris",
};

const STYLE_PATTERNS: Array<[RegExp, string]> = [
  [/\b(lujo|luxury|premium|elegante|exclusiv)\b/i, "premium editorial"],
  [/\b(minimal|minimalista|limpio|clean|notion)\b/i, "minimalista limpio"],
  [/\b(futurista|neon|cyber|ia|ai|tech|tecnologico)\b/i, "futurista tecnologico"],
  [/\b(divertido|playful|infantil|colorido|vibrante)\b/i, "colorido dinamico"],
  [/\b(corporativo|empresarial|formal|b2b)\b/i, "corporativo sobrio"],
  [/\b(oscuro|dark|negro)\b/i, "dark premium"],
  [/\b(retro|vintage|clasico)\b/i, "retro moderno"],
];

const PHYSICAL_PRODUCT_RE =
  /\b(producto|productos|tenis|zapato|zapatos|zapatilla|zapatillas|sneaker|sneakers|ropa|camiseta|playera|bolsa|bolso|joya|joyeria|mueble|muebles|perfume|cosmetico|maquillaje|comida|platillo|bebida|cafe|pan|pastel|auto|carro|refaccion|pintura|herramienta|libro|juguete|reloj|lentes|gafas)\b/i;

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function detectProjectType(text: string): GafcoreBriefType {
  const t = normalizeText(text);
  if (/\b(directorio|directory|listado|catalogo\s+de\s+(negocios|medicos|proveedores|profesionales)|proveedores|profesionales)\b/.test(t)) return "directory";
  if (/\b(marketplace|multi\s*vendedor|vendedores|proveedores)\b/.test(t)) return "marketplace";
  if (/\b(curso|cursos|academia|escuela|clases|lms|learning|educacion|elearning)\b/.test(t)) return "education";
  if (/\b(evento|eventos|boda|concierto|conferencia|boletos|tickets|rsvp|invitacion)\b/.test(t)) return "events";
  if (/\b(inmobiliaria|real estate|propiedad|propiedades|departamento|casa|renta|venta de casas|agente inmobiliario)\b/.test(t)) return "real-estate";
  if (/\b(logistica|envios|paqueteria|tracking|rastreo|rutas|transporte|delivery)\b/.test(t)) return "logistics";
  if (/\b(pos|punto de venta|inventario|stock|caja|ordenes|ventas)\b/.test(t)) return "pos";
  if (/\b(analytics|analitica|reporting|graficas|bi|exportacion)\b/.test(t)) return "analytics";
  if (/\b(chatbot|generador|prompts|ai tool|herramienta ia|ia para|asistente ia)\b/.test(t)) return "ai-tool";
  if (/\b(comunidad|social|feed|perfiles|posts|grupos|mensajes|foro)\b/.test(t)) return "community";
  if (/\b(donacion|donaciones|fundacion|ong|nonprofit|voluntariado|campana social)\b/.test(t)) return "nonprofit";
  if (/\b(gobierno|municipal|ayuntamiento|tramites|ciudadano|servicios publicos)\b/.test(t)) return "government";
  if (/\b(cotizador|wizard|multi paso|multipaso|formulario multipaso|onboarding|encuesta)\b/.test(t)) return "multi-step-form";
  if (/\b(mapa|mapas|ubicaciones|sucursales|zonas|rutas|geolocalizacion)\b/.test(t)) return "map-app";
  if (/\b(tienda|ecommerce|e-commerce|catalogo|carrito|checkout|venta|vender|producto|productos|precio|shop)\b/.test(t)) {
    return "ecommerce";
  }
  if (/\b(restaurante|restaurant|menu|comida|platillo|chef|pizzeria|cafeteria|bar\b)\b/.test(t)) return "restaurant";
  if (/\b(reserva|reservas|cita|citas|agenda|booking|calendario|turno|horario)\b/.test(t)) return "booking";
  if (/\b(dashboard|panel|admin|crm|erp|metricas|analytics|operativo|tabla|reportes)\b/.test(t)) return "dashboard";
  if (/\b(saas|software|plataforma|suscripcion|usuarios|equipo|workspace)\b/.test(t)) return "saas";
  if (/\b(app movil|mobile app|ios|android|aplicacion movil)\b/.test(t)) return "mobile-app";
  if (/\b(portafolio|portfolio|galeria|proyectos|cv|resume)\b/.test(t)) return "portfolio";
  if (/\b(blog|articulos|noticias|revista|newsletter)\b/.test(t)) return "blog";
  if (/\b(app|aplicacion|sistema|herramienta|calculadora|formulario|gestor)\b/.test(t)) return "business-app";
  if (/\b(landing|pagina|pagina web|web|sitio|home|hero)\b/.test(t)) return "landing";
  return "generic";
}

function detectVertical(text: string, projectType: GafcoreBriefType): string {
  const t = normalizeText(text);
  const verticals: Array<[RegExp, string]> = [
    [/\b(tenis|zapato|zapatilla|sneaker|calzado)\b/, "calzado"],
    [/\b(ropa|moda|boutique|fashion|outfit)\b/, "moda"],
    [/\b(comida|restaurante|pizzeria|cafeteria|bar|platillo|menu)\b/, "gastronomia"],
    [/\b(barber|barberia|salon|belleza|spa|unas|cosmetico|maquillaje)\b/, "belleza"],
    [/\b(inmobiliaria|real estate|casa|departamento|renta|propiedad)\b/, "inmobiliaria"],
    [/\b(medico|clinica|dental|salud|doctor|hospital|terapia)\b/, "salud"],
    [/\b(abogado|legal|juridico|notaria)\b/, "legal"],
    [/\b(finanzas|banco|contabilidad|seguros|prestamo|credito)\b/, "finanzas"],
    [/\b(educacion|curso|escuela|academia|clase|aprendizaje)\b/, "educacion"],
    [/\b(fitness|gym|yoga|pilates|crossfit|deporte)\b/, "fitness"],
    [/\b(auto|carro|vehiculo|taller|refaccion|mecanico)\b/, "automotriz"],
    [/\b(viaje|turismo|hotel|airbnb|vuelo|playa)\b/, "viajes"],
    [/\b(evento|boda|concierto|conferencia|boletos|rsvp)\b/, "eventos"],
    [/\b(construccion|arquitectura|remodelacion|pintura|contratista)\b/, "construccion"],
    [/\b(logistica|envio|paqueteria|delivery|transporte)\b/, "logistica"],
    [/\b(mascota|veterinaria|pet|perro|gato)\b/, "mascotas"],
    [/\b(fundacion|ong|donacion|voluntariado)\b/, "impacto social"],
    [/\b(gobierno|municipal|tramites|ciudadano)\b/, "gobierno"],
    [/\b(rrhh|recursos humanos|empleados|nomina|talento)\b/, "recursos humanos"],
    [/\b(ia|ai|software|saas|dashboard|crm|analytics)\b/, "software"],
  ];
  return verticals.find(([pattern]) => pattern.test(t))?.[1] ?? projectType;
}

function detectSubject(text: string, projectType: GafcoreBriefType): string {
  const clean = text.trim().replace(/\s+/g, " ");
  const patterns = [
    /\b(?:tienda|pagina|web|landing|app|dashboard|sistema|catalogo)\s+(?:de|para)\s+(.{3,80})$/i,
    /\b(?:venta|vender)\s+de\s+(.{3,80})$/i,
    /\b(?:hazme|crea|crear|construye|genera)\s+(?:una|un)?\s*(?:pagina|web|tienda|app|sistema)?\s*(?:de|para)?\s*(.{3,80})$/i,
  ];
  for (const pattern of patterns) {
    const match = clean.match(pattern)?.[1]?.trim();
    if (match) return match.replace(/[.?!]+$/, "");
  }
  return projectType === "generic" ? "proyecto profesional" : projectType;
}

function detectStyle(text: string, projectType: GafcoreBriefType): string {
  const found = STYLE_PATTERNS.find(([pattern]) => pattern.test(text))?.[1];
  if (found) return found;
  if (projectType === "dashboard" || projectType === "saas") return "utilitario premium";
  if (projectType === "ecommerce" || projectType === "marketplace") return "comercial moderno";
  if (projectType === "restaurant") return "sensorial editorial";
  return "profesional moderno";
}

function detectPalette(text: string, vertical: string, style: string): string[] {
  const explicit = Object.keys(COLOR_WORDS).filter((word) => new RegExp(`\\b${word}s?\\b`, "i").test(text));
  if (explicit.length > 0) return [...new Set(explicit.map((word) => COLOR_WORDS[word]))].slice(0, 4);
  if (style.includes("dark")) return ["zinc", "blanco", "acento lima o cyan"];
  if (style.includes("premium")) return ["negro", "marfil", "dorado suave"];
  if (style.includes("futurista")) return ["negro", "cyan", "violeta", "grafito"];
  if (vertical === "gastronomia") return ["carmin", "crema", "carbon", "verde oliva"];
  if (vertical === "salud") return ["blanco", "azul confianza", "verde menta"];
  if (vertical === "finanzas") return ["azul profundo", "verde exito", "gris claro"];
  if (vertical === "calzado" || vertical === "moda") return ["negro", "blanco", "acento vibrante"];
  return ["neutros", "1 color acento", "superficies claras/oscuras coherentes"];
}

function detectEffects(text: string, projectType: GafcoreBriefType): string[] {
  const effects: string[] = [];
  if (/\b(animacion|animaciones|motion|efecto|hover|microinteraccion|transicion)\b/i.test(text)) {
    effects.push("microinteracciones hover/focus y transiciones de 180-250ms");
  }
  if (/\b(parallax|scroll|reveal)\b/i.test(text)) effects.push("reveal on scroll sin layout shift");
  if (/\b(glass|glassmorphism|blur)\b/i.test(text)) effects.push("glassmorphism sutil y blur controlado");
  if (/\b(3d|three|modelo 3d)\b/i.test(text)) effects.push("escena 3D o mockup 3D con fallback visual");
  if (effects.length === 0 && (projectType === "landing" || projectType === "ecommerce")) {
    effects.push("hover states, focus states y feedback visual en CTAs");
  }
  if (effects.length === 0) effects.push("estados interactivos visibles y transiciones discretas");
  return effects;
}

function requiredSections(projectType: GafcoreBriefType, vertical: string): string[] {
  const baseByType: Record<GafcoreBriefType, string[]> = {
    ecommerce: ["header con marca y carrito", "hero comercial", "catalogo amplio", "ofertas/descuentos", "colecciones/categorias", "beneficios de compra", "newsletter/contacto", "footer completo"],
    marketplace: ["header con busqueda", "hero marketplace", "categorias", "cards de vendedores/productos", "filtros", "flujo de contacto/compra", "confianza"],
    directory: ["header con busqueda", "hero de directorio", "categorias", "listado de perfiles/negocios", "filtros", "detalle/contacto", "confianza"],
    education: ["hero del curso/academia", "programas o modulos", "instructores", "progreso/demo", "testimonios", "CTA de inscripcion"],
    events: ["hero del evento", "agenda", "speakers/invitados", "tickets o RSVP", "ubicacion", "FAQ/contacto"],
    "real-estate": ["hero con busqueda", "filtros de propiedades", "cards de propiedades", "detalle/agente", "mapa o zonas", "formulario de cita"],
    logistics: ["hero operativo", "cotizador/tracking", "rutas o estados", "servicios", "beneficios", "contacto"],
    pos: ["sidebar/nav", "catalogo/stock", "carrito/orden", "caja/totales", "tabla de ventas", "estado de inventario"],
    analytics: ["sidebar/nav", "KPIs", "graficas", "filtros de periodo", "tabla de datos", "export/demo action"],
    "ai-tool": ["hero del producto IA", "input/prompt demo", "resultado generado", "historial", "features", "pricing o CTA"],
    community: ["feed", "perfiles", "composer/publicacion", "grupos o categorias", "mensajes/notificaciones", "acciones sociales"],
    nonprofit: ["hero de causa", "impacto con metricas", "campanas", "donacion/demo", "voluntariado", "transparencia/contacto"],
    government: ["hero ciudadano", "tramites", "busqueda", "estado de solicitud", "noticias/avisos", "contacto institucional"],
    "multi-step-form": ["hero o intro", "pasos visibles", "formulario por etapas", "resumen", "validacion", "confirmacion"],
    "map-app": ["header con busqueda", "mapa o panel de ubicaciones", "filtros", "lista de lugares", "detalle", "ruta/contacto"],
    restaurant: ["hero gastronomico", "menu destacado", "combos/populares", "reservas o pedido", "ubicacion/contacto", "reviews"],
    booking: ["hero de servicio", "selector de servicio", "fecha/hora", "datos del cliente", "confirmacion", "listado de citas demo"],
    dashboard: ["sidebar/nav", "KPIs", "tabla o lista operativa", "filtros", "detalle/acciones", "estados vacio/loading"],
    saas: ["navbar", "hero con propuesta de valor", "features", "mockup del producto", "pricing o planes", "social proof", "CTA final"],
    landing: ["hero", "beneficios", "servicios/features", "prueba social", "contacto/CTA final"],
    portfolio: ["hero personal/marca", "galeria de proyectos", "casos destacados", "servicios o skills", "contacto"],
    blog: ["header", "hero editorial", "lista de articulos", "categorias", "newsletter", "footer"],
    "mobile-app": ["shell movil", "onboarding", "vista principal", "acciones primarias", "estado vacio", "perfil/configuracion"],
    "business-app": ["navegacion", "flujo principal", "formulario o CRUD demo", "estado de datos", "feedback de accion"],
    generic: ["hero claro", "secciones segun negocio", "acciones reales", "estado/feedback", "CTA final"],
  };
  const sections = [...baseByType[projectType]];
  if (vertical === "salud" && !sections.includes("confianza")) sections.push("confianza, certificaciones y privacidad");
  if (vertical === "legal" && !sections.includes("confianza")) sections.push("areas de practica y consulta");
  return sections;
}

function requiredInteractions(projectType: GafcoreBriefType): string[] {
  const map: Record<GafcoreBriefType, string[]> = {
    ecommerce: ["agregar/quitar del carrito", "total en vivo", "filtros", "persistencia localStorage"],
    marketplace: ["buscar/filtrar", "seleccionar vendedor/producto", "solicitar contacto", "estado visible"],
    directory: ["buscar/filtrar", "seleccionar perfil", "guardar/contactar", "estado visible"],
    education: ["seleccionar curso/modulo", "progreso demo", "inscripcion o lead", "feedback visible"],
    events: ["seleccionar ticket/RSVP", "filtrar agenda", "guardar registro demo", "confirmacion"],
    "real-estate": ["filtrar propiedades", "seleccionar propiedad", "agendar visita", "favoritos demo"],
    logistics: ["calcular cotizacion o tracking", "actualizar estado", "filtrar rutas", "feedback"],
    pos: ["agregar producto", "actualizar cantidad", "calcular total", "registrar venta demo"],
    analytics: ["filtrar periodo", "cambiar metrica", "seleccionar fila", "export demo"],
    "ai-tool": ["enviar prompt", "generar resultado demo", "guardar historial", "limpiar"],
    community: ["crear post demo", "like/guardar", "filtrar feed", "seleccionar perfil"],
    nonprofit: ["seleccionar monto/causa", "registrar donacion demo", "voluntariado lead", "confirmacion"],
    government: ["buscar tramite", "iniciar solicitud demo", "consultar estado", "feedback"],
    "multi-step-form": ["navegar pasos", "validar campos", "calcular/resumir", "confirmar"],
    "map-app": ["filtrar lugares", "seleccionar marcador/lista", "calcular ruta demo", "contactar"],
    restaurant: ["filtrar menu", "agregar pedido o reservar", "confirmacion visible"],
    booking: ["seleccionar servicio/fecha/hora", "validar formulario", "guardar demo en localStorage", "confirmacion"],
    dashboard: ["filtrar tabla", "seleccionar fila", "actualizar estado", "metricas derivadas"],
    saas: ["CTA funcional", "toggle/pricing o tabs", "formulario/demo interactiva"],
    landing: ["CTA scroll/contacto", "formulario o accion visible", "hover/focus completo"],
    portfolio: ["filtrar proyectos", "abrir detalle o modal", "contacto"],
    blog: ["filtrar categorias", "buscar o seleccionar articulo", "newsletter demo"],
    "mobile-app": ["tabs o navegacion local", "acciones primarias", "estado persistente demo"],
    "business-app": ["crear/editar demo", "validacion", "persistencia local", "feedback"],
    generic: ["botones principales funcionales", "estado visible", "feedback de usuario"],
  };
  return map[projectType];
}

function dataModel(projectType: GafcoreBriefType, vertical: string): string[] {
  if (projectType === "ecommerce") return ["productos con nombre, precio, categoria, imagen, variantes", "carrito", "totales"];
  if (projectType === "directory") return ["perfiles/listados", "categorias", "ubicacion/contacto", "ratings"];
  if (projectType === "education") return ["cursos", "modulos", "instructores", "progreso"];
  if (projectType === "events") return ["agenda", "tickets", "invitados", "registros RSVP"];
  if (projectType === "real-estate") return ["propiedades", "precios", "zonas", "agentes", "visitas"];
  if (projectType === "logistics") return ["envios", "rutas", "estados", "cotizaciones"];
  if (projectType === "pos") return ["productos", "stock", "orden", "ventas", "totales"];
  if (projectType === "analytics") return ["KPIs", "series", "filtros", "registros", "export"];
  if (projectType === "ai-tool") return ["prompts", "respuestas demo", "historial", "configuracion"];
  if (projectType === "community") return ["usuarios", "posts", "grupos", "notificaciones"];
  if (projectType === "nonprofit") return ["campanas", "donaciones demo", "impacto", "voluntarios"];
  if (projectType === "government") return ["tramites", "solicitudes", "estados", "avisos"];
  if (projectType === "multi-step-form") return ["pasos", "campos", "resumen", "confirmacion"];
  if (projectType === "map-app") return ["lugares", "categorias", "coordenadas demo", "rutas"];
  if (projectType === "booking") return ["servicios", "slots de agenda", "cliente", "reservas"];
  if (projectType === "dashboard") return ["KPIs", "registros", "estados", "filtros"];
  if (projectType === "restaurant") return ["platillos", "categorias", "precios", "pedido/reserva"];
  if (projectType === "portfolio") return ["proyectos", "tags", "casos", "contacto"];
  if (vertical === "salud") return ["servicios", "especialistas", "citas", "testimonios"];
  return ["datos demo coherentes con la industria", "estado local", "feedback"];
}

function mediaRules(projectType: GafcoreBriefType, vertical: string, physicalProduct: boolean): string[] {
  const rules = [
    "no usar placeholders genericos ni imagenes que contradigan la industria",
    "si usas imagenes, deben representar el producto/servicio pedido",
  ];
  if (physicalProduct || projectType === "ecommerce" || projectType === "restaurant") {
    rules.push("prohibido paisajes/random para productos fisicos; usar foto/mockup de producto o cards visuales generadas en JSX");
  }
  if (projectType === "saas" || projectType === "dashboard") {
    rules.push("preferir mockups de interfaz hechos en JSX antes que stock photos");
  }
  if (vertical === "calzado") rules.push("para calzado, mostrar tenis/sneakers, tallas, colores y detalle de producto");
  return rules;
}

function qualityChecks(projectType: GafcoreBriefType, physicalProduct: boolean): string[] {
  const checks = [
    "primera pantalla comunica la industria en menos de 3 segundos",
    "sin Producto A, Servicio 1, Lorem ipsum, Acme o textos de relleno visibles",
    "responsive mobile y desktop sin texto encimado",
    "todos los CTAs principales hacen algo visible",
  ];
  if (projectType === "ecommerce" || physicalProduct) {
    checks.push("catalogo amplio con productos especificos, precios, descuentos/ofertas, colecciones, beneficios, newsletter/contacto, footer y accion de compra");
  }
  if (projectType === "dashboard" || projectType === "business-app") {
    checks.push("flujo operativo repetible con tablas/listas, filtros y estados");
  }
  return checks;
}

export function buildGafcorePromptMasterBrief(instruction: string): GafcoreBriefIntent {
  const projectType = detectProjectType(instruction);
  const vertical = detectVertical(instruction, projectType);
  const subject = detectSubject(instruction, projectType);
  const physicalProduct = PHYSICAL_PRODUCT_RE.test(instruction) || projectType === "ecommerce";
  const style = detectStyle(instruction, projectType);
  return {
    projectType,
    vertical,
    subject,
    physicalProduct,
    style,
    palette: detectPalette(instruction, vertical, style),
    effects: detectEffects(instruction, projectType),
    requiredSections: requiredSections(projectType, vertical),
    requiredInteractions: requiredInteractions(projectType),
    dataModel: dataModel(projectType, vertical),
    mediaRules: mediaRules(projectType, vertical, physicalProduct),
    qualityChecks: qualityChecks(projectType, physicalProduct),
  };
}

export function buildGafcorePromptMasterBriefAppend(instruction: string): string {
  const brief = buildGafcorePromptMasterBrief(instruction);
  return [
    "\n[GAFCORE PROMPT MASTER BRIEF]",
    "Antes de escribir codigo, convierte el pedido en esta especificacion y cumplla literalmente.",
    `Tipo de proyecto: ${brief.projectType}`,
    `Vertical/industria: ${brief.vertical}`,
    `Objeto principal: ${brief.subject}`,
    `Estilo visual: ${brief.style}`,
    `Paleta sugerida: ${brief.palette.join(", ")}`,
    `Efectos/interacciones visuales: ${brief.effects.join(" | ")}`,
    `Secciones obligatorias: ${brief.requiredSections.join(" | ")}`,
    `Interacciones funcionales obligatorias: ${brief.requiredInteractions.join(" | ")}`,
    `Datos demo/modelo local: ${brief.dataModel.join(" | ")}`,
    `Reglas de media/imagenes: ${brief.mediaRules.join(" | ")}`,
    "Restricciones:",
    "- Matriz obligatoria: detectar formato (landing/app/dashboard/marketplace/booking/etc.), vertical (salud/legal/comida/educacion/logistica/etc.) y flujo principal (vender/reservar/cotizar/administrar/publicar/aprender/contactar/reportar).",
    "- Construir una experiencia completa en el preview, no una maqueta decorativa.",
    "- No usar GafCore, el logo de GafCore ni branding de la plataforma dentro del proyecto generado; inventa una marca coherente con el negocio del usuario si no dio una.",
    "- Si el pedido es ecommerce/producto, construir una pagina completa tipo marketplace profesional: navbar, hero comercial, catalogo amplio, ofertas/descuentos, colecciones/categorias, beneficios, newsletter/contacto, footer y carrito/acciones reales.",
    "- Para tiendas de tenis/calzado, el minimo aceptable es estilo SneakerZone/EditCore: productos con marca/nombre/precio/descuento/rating, fotos coherentes, secciones de ofertas, colecciones, beneficios, newsletter y footer.",
    "- No agregar auth, base de datos, pagos reales ni integraciones externas salvo que el usuario lo pida explicitamente.",
    "- No tocar Supabase, variables, login, deploy ni infraestructura para un build visual/funcional normal.",
    "- Si falta un dato, asumir una opcion profesional coherente y seguir construyendo.",
    `Done when: ${brief.qualityChecks.join(" | ")}`,
  ].join("\n");
}
