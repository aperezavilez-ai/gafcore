import type { ProjectValidationIssue } from "@/lib/gafcore-ai-validation.shared";
import type { GafcoreDeliveredFile } from "@/lib/gafcore-chat-delivery.shared";
import { buildGafcorePromptMasterBrief } from "@/lib/gafcore-prompt-master-brief.shared";

type QualityIntent = {
  buildQuality: boolean;
  commerce: boolean;
  shoes: boolean;
  physicalProduct: boolean;
  projectType: string;
};

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function detectQualityIntent(instruction: string): QualityIntent {
  const text = normalizeText(instruction);
  const brief = buildGafcorePromptMasterBrief(instruction);
  const shoes = /\b(calzado|tenis|zapato|zapatos|zapatilla|zapatillas|sneaker|sneakers|shoe|shoes)\b/.test(
    text,
  );
  const commerce =
    shoes ||
    /\b(tienda|venta|vender|catalogo|producto|productos|carrito|checkout|precio|ecommerce|e-commerce|shop)\b/.test(
      text,
    );
  const buildQuality =
    brief.projectType !== "generic" ||
    /\b(haz|hazme|crea|crear|construye|construir|genera|generar|pagina|web|sitio|app|aplicacion|landing|dashboard|tienda|sistema|proyecto)\b/.test(
      text,
    );
  return {
    buildQuality,
    commerce,
    shoes,
    physicalProduct: brief.physicalProduct,
    projectType: brief.projectType,
  };
}

function qualitySource(files: GafcoreDeliveredFile[]): string {
  return files
    .filter((file) => /\.(tsx|jsx|ts|js|html|css)$/i.test(file.name))
    .map((file) => `\n/* ${file.name} */\n${file.content}`)
    .join("\n");
}

function primaryFile(files: GafcoreDeliveredFile[]): string {
  return files.find((file) => /^app\.(tsx|jsx)$/i.test(file.name))?.name ?? files[0]?.name ?? "App.tsx";
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function countAny(text: string, patterns: RegExp[]): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

export function auditGafcoreDeliveryQuality(
  files: GafcoreDeliveredFile[],
  originalInstruction: string,
): ProjectValidationIssue[] {
  const source = qualitySource(files);
  const intent = detectQualityIntent(`${originalInstruction}\n${source}`);
  if (!intent.buildQuality || files.length === 0) return [];

  const text = normalizeText(source);
  const file = primaryFile(files);
  const issues: ProjectValidationIssue[] = [];
  const add = (message: string) => {
    issues.push({ severity: "error", category: "functional", file, message });
  };

  if (/\b(producto|modelo|item|articulo|feature|servicio|service|card|plan|proyecto)\s+[a-d1-9]\b/i.test(source)) {
    add("La entrega usa nombres genericos tipo Producto A/Servicio 1/Feature 1; necesita nombres reales y especificos del pedido.");
  }

  if (/lorem ipsum|coming soon|imagen pendiente|nombre del producto|your company|acme|demo company|example company/i.test(text)) {
    add("La entrega contiene placeholders visibles; debe parecer un negocio listo, no una demo.");
  }

  if (/\bgafcore\b|gafcore-logo|GafCoreLogo/i.test(source)) {
    add("El proyecto generado no debe usar el logo o marca GafCore como marca del negocio del cliente.");
  }

  const hasRandomImages = /picsum\.photos|placehold\.co|via\.placeholder|unsplash\.it|source\.unsplash\.com/i.test(
    source,
  );
  const hasLandscapeTerms = hasAny(text, [
    /\bpaisaje/,
    /\blandscape/,
    /\bmontana/,
    /\bmountain/,
    /\bwaterfall/,
    /\bcascada/,
    /\bplaya\b/,
    /\bbeach\b/,
  ]);

  if ((intent.physicalProduct || intent.commerce || intent.projectType === "restaurant") && (hasRandomImages || hasLandscapeTerms)) {
    add("Las imagenes no corresponden al producto/industria; elimina placeholders, picsum o paisajes aleatorios.");
  }

  const needsOperation = /dashboard|business-app|mobile-app|booking|marketplace/.test(intent.projectType);
  const hasInteractiveCode = hasAny(source, [
    /\bonClick\s*=/,
    /\bonSubmit\s*=/,
    /\buseState\b/,
    /\blocalStorage\b/,
    /\bfilter\s*\(/,
    /\bset[A-Z][A-Za-z0-9_]*\s*\(/,
  ]);
  if (needsOperation && !hasInteractiveCode) {
    add("El proyecto operativo no tiene interacciones reales; necesita estado, handlers, filtros/formularios o persistencia demo.");
  }

  const needsCta = /landing|saas|restaurant|ecommerce|marketplace|portfolio/.test(intent.projectType);
  const hasCta = hasAny(text, [
    /\bcta\b/,
    /\bcontacto\b/,
    /\breserv/,
    /\bcompr/,
    /\bagregar/,
    /\bsolicitar/,
    /\bempezar/,
    /\bbutton\b/,
    /\bhref=/,
  ]);
  if (needsCta && !hasCta) {
    add("Falta una accion principal clara; la experiencia debe tener CTA o flujo visible.");
  }

  if (intent.projectType === "saas") {
    const score = countAny(text, [
      /\bfeature/, /\bpricing|precio|plan/, /\bmockup|demo|dashboard|preview/,
      /\btestimonio|cliente|social proof/, /\bfaq\b|preguntas/,
    ]);
    if (score < 3 || !hasInteractiveCode) {
      add("Un SaaS profesional necesita hero, features, mockup/demo del producto, pricing/testimonios/FAQ y CTAs interactivos.");
    }
  }

  if (intent.projectType === "dashboard" || intent.projectType === "analytics") {
    const score = countAny(text, [
      /\bkpi\b|metrica|metricas|analytics/, /\btabla|table|lista/,
      /\bfiltro|filter|periodo/, /\bgrafica|chart|barra|linea/,
      /\bestado|status|export/,
    ]);
    if (score < 3 || !hasInteractiveCode) {
      add("Un dashboard/analytics debe incluir KPIs, tablas/listas, filtros, estados/graficas y acciones operativas reales.");
    }
  }

  if (intent.projectType === "booking") {
    const score = countAny(text, [
      /\bservicio|servicios/, /\bfecha|dia|hora|slot|agenda/,
      /\bnombre|telefono|email|correo/, /\bconfirmacion|confirmado|reserva recibida/,
      /\breserv/,
    ]);
    if (score < 4 || !hasInteractiveCode) {
      add("Un flujo de reservas necesita servicio, fecha/hora, datos del cliente, validacion y confirmacion visible.");
    }
  }

  if (intent.projectType === "restaurant") {
    const score = countAny(text, [
      /\bmenu|platillo|plato|combo/, /\bprecio|\$\s?\d/,
      /\breserva|pedido|orden/, /\bubicacion|direccion|horario|telefono/,
      /\breview|testimonio|estrella/,
    ]);
    if (score < 4) {
      add("Un restaurante debe incluir menu con precios, pedido/reserva, ubicacion/horarios/contacto y confianza/reviews.");
    }
  }

  if (intent.projectType === "marketplace" || intent.projectType === "directory") {
    const score = countAny(text, [
      /\bbuscar|busqueda|search/, /\bfiltro|categoria/,
      /\bperfil|vendedor|proveedor|profesional|negocio/,
      /\brating|review|verificado/, /\bcontacto|solicitar|guardar/,
    ]);
    if (score < 4 || !hasInteractiveCode) {
      add("Un marketplace/directorio necesita busqueda, filtros, cards de perfiles/productos, detalle/contacto y senales de confianza.");
    }
  }

  if (intent.projectType === "education") {
    const score = countAny(text, [
      /\bcurso|clase|modulo|leccion/, /\binstructor|mentor|profesor/,
      /\bprogreso|avance|completado/, /\binscripcion|registr/,
      /\btestimonio|certificado/,
    ]);
    if (score < 4 || !hasInteractiveCode) {
      add("Un proyecto educativo necesita cursos/modulos, instructor, progreso/demo, inscripcion y confianza/certificacion.");
    }
  }

  if (intent.projectType === "events") {
    const score = countAny(text, [
      /\bagenda|programa|horario/, /\bspeaker|invitado|artista/,
      /\bticket|boleto|rsvp|registro/, /\bubicacion|lugar|mapa/,
      /\bfaq|contacto/,
    ]);
    if (score < 4 || !hasInteractiveCode) {
      add("Un evento necesita agenda, invitados/speakers, tickets o RSVP, ubicacion y confirmacion/contacto.");
    }
  }

  if (intent.projectType === "real-estate") {
    const score = countAny(text, [
      /\bpropiedad|casa|departamento|inmueble/, /\bprecio|\$\s?\d/,
      /\brecamara|habitacion|m2|metros/, /\bfiltro|zona|ubicacion/,
      /\bagente|visita|contacto/,
    ]);
    if (score < 4 || !hasInteractiveCode) {
      add("Un proyecto inmobiliario necesita propiedades con precio/datos, filtros, zonas/ubicacion, agente y agenda/contacto.");
    }
  }

  if (intent.projectType === "pos") {
    const score = countAny(text, [
      /\bproducto|sku|stock|inventario/, /\bcaja|venta|orden/,
      /\btotal|\$\s?\d/, /\bcantidad|qty/, /\brecibo|ticket|registrar/,
    ]);
    if (score < 4 || !hasInteractiveCode) {
      add("Un POS/inventario necesita productos/stock, orden o carrito, cantidades, totales y registro de venta demo.");
    }
  }

  if (intent.projectType === "ai-tool") {
    const score = countAny(text, [
      /\bprompt|input|mensaje/, /\bgenerar|resultado|respuesta/,
      /\bhistorial|history/, /\bmodelo|configuracion|tono/,
      /\bfeature|pricing|demo/,
    ]);
    if (score < 4 || !hasInteractiveCode) {
      add("Una herramienta de IA necesita input de prompt, resultado generado demo, historial/configuracion y CTA o pricing/features.");
    }
  }

  if (intent.projectType === "multi-step-form") {
    const score = countAny(text, [
      /\bpaso|step/, /\bsiguiente|anterior|continuar/,
      /\bresumen|summary/, /\bvalid/, /\bconfirmacion|enviado/,
    ]);
    if (score < 4 || !hasInteractiveCode) {
      add("Un formulario multipaso necesita pasos visibles, navegacion, validacion, resumen y confirmacion.");
    }
  }

  if (!intent.commerce) return issues;

  const hasCart = hasAny(text, [
    /\bcarrito\b/,
    /\bcart\b/,
    /addtocart/,
    /agregar\s+al\s+carrito/,
    /anadir\s+al\s+carrito/,
    /añadir\s+al\s+carrito/i,
  ]);
  const hasPrice = hasAny(text, [/\$\s?\d/, /\bmxn\b/, /\busd\b/, /\bprecio\b/, /\bprice\b/]);
  const hasCatalog = hasAny(text, [/\bproducto/, /\bproductos/, /\bcatalogo\b/, /\bcoleccion/, /\bgrid\b/]);

  if (!hasCatalog || !hasPrice || !hasCart) {
    add("El e-commerce no esta completo: debe incluir catalogo, precios y carrito/acciones de compra funcionales.");
  }

  const hasHero = hasAny(text, [
    /\bhero\b/,
    /\bnueva temporada\b/,
    /\bcoleccion/,
    /\boferta\b/,
    /\bcompra/,
    /\btienda\b/,
    /\bventa\b/,
  ]);
  const hasBusinessInfo = hasAny(text, [
    /\bcontacto\b/,
    /\btelefono\b/,
    /\btel\b/,
    /\bemail\b/,
    /\bcorreo\b/,
    /\bdireccion\b/,
    /\bubicacion\b/,
    /\bhorario\b/,
    /\bwhatsapp\b/,
  ]);
  const hasTrustOrRegister = hasAny(text, [
    /\benvio/,
    /\bdevolucion/,
    /\bgarantia/,
    /\breview/,
    /\brating/,
    /\bestrella/,
    /\bnewsletter/,
    /\bregistro\b/,
    /\bcupon\b/,
    /\bdescuento\b/,
  ]);

  if (!hasHero || !hasBusinessInfo || !hasTrustOrRegister) {
    add("La pagina de venta esta incompleta: necesita hero comercial, datos del negocio/contacto y seccion de confianza o registro.");
  }

  if (!intent.shoes) return issues;

  const hasShoeCopy = hasAny(text, [
    /\btenis\b/,
    /\bcalzado\b/,
    /\bzapato/,
    /\bzapatilla/,
    /\bsneaker/,
    /\brunner/,
    /\btrainer/,
    /\bshoe/,
  ]);
  const hasSizes = hasAny(text, [/\btalla/, /\btallas/, /\bsize/, /\bsizes/, /\b(24|25|26|27|28|29|30)\b/]);
  const hasColors = hasAny(text, [/\bcolor/, /\bcolores/, /\bnegro\b/, /\bblanco\b/, /\brojo\b/, /\bazul\b/]);
  const hasTrust = hasAny(text, [
    /\benvio/,
    /\benvío/i,
    /\bdevolucion/,
    /\bdevolución/i,
    /\breview/,
    /\breviews/,
    /\brating/,
    /\bestrella/,
  ]);
  if (!hasShoeCopy) {
    add("El contenido no habla claramente de tenis/calzado aunque el pedido lo exige.");
  }
  if (!hasSizes || !hasColors) {
    add("Una tienda de tenis debe mostrar tallas y colores seleccionables o visibles.");
  }
  if (!hasTrust) {
    add("Faltan senales comerciales basicas: envio, devoluciones, reviews/rating o garantia.");
  }
  if (hasRandomImages || hasLandscapeTerms) {
    add("Las imagenes no corresponden a calzado; elimina picsum/placeholders/paisajes y usa mockups o fotos de tenis.");
  }

  const productNameMatches = source.match(/\b(Air|Street|Urban|Court|Retro|Skate|Cloud|Zoom|Suede|Superstar|Old Skool|Runner|Classic|Boost|Vapor)\b/gi) ?? [];
  const hasOffers = hasAny(text, [/\boferta/, /\bdescuento/, /\btemporada/, /\bpromo/, /-\s?\d+\s?%/]);
  const hasCollections = hasAny(text, [/\bcoleccion/, /\bcolecciones/, /\brunning\b/, /\bstreet/, /\bbasketball/, /\blifestyle/]);
  const hasNewsletterFooter = hasAny(text, [/\bnewsletter/, /\bsuscrib/, /\bfooter\b/, /\bderechos reservados/, /\benlaces\b/]);
  if (productNameMatches.length < 6 || !hasOffers || !hasCollections || !hasNewsletterFooter) {
    add("Una tienda de tenis profesional debe parecer pagina completa tipo marketplace: catalogo amplio, ofertas, colecciones, beneficios, newsletter/contacto y footer.");
  }

  return issues;
}

export function buildQualityFixInstruction(
  issues: ProjectValidationIssue[],
  originalInstruction: string,
): string {
  return [
    "[GAFCORE QUALITY RETRY]",
    `Pedido original: ${originalInstruction}`,
    "Tu entrega compila, pero no cumple la calidad visual/operativa solicitada.",
    "Corrige estos puntos antes de responder con files completos:",
    ...issues.map((issue) => `- ${issue.file}: ${issue.message}`),
    "Entrega una experiencia profesional completa segun el tipo de proyecto: industria clara, layout premium, copy especifico, interacciones reales, responsive y feedback visible.",
    "Si es e-commerce/producto: catalogo especifico, precios, variantes, filtros, carrito/seleccion, confianza comercial e imagenes coherentes con el producto.",
    "Si es dashboard/app operativa: navegacion, datos demo, filtros/formularios, estado, handlers y acciones repetibles.",
    "Si es SaaS, booking, restaurante, directorio, educacion, evento, inmobiliaria, POS, IA o formulario multipaso: cumple sus secciones, datos e interacciones obligatorias antes de entregar.",
    "Prohibido Producto A/Modelo A/Servicio 1/Feature 1, placeholders, Acme, Lorem ipsum, picsum.photos, paisajes o imagenes aleatorias.",
    'Responde SOLO JSON { "reply": "...", "files": [...] } con App.tsx completo y archivos necesarios.',
  ].join("\n");
}
