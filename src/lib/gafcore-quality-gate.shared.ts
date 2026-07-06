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

export function auditGafcoreDeliveryQuality(
  files: GafcoreDeliveredFile[],
  originalInstruction: string,
): ProjectValidationIssue[] {
  const intent = detectQualityIntent(originalInstruction);
  if (!intent.buildQuality || files.length === 0) return [];

  const source = qualitySource(files);
  const text = normalizeText(source);
  const file = primaryFile(files);
  const issues: ProjectValidationIssue[] = [];
  const add = (message: string) => {
    issues.push({ severity: "error", category: "functional", file, message });
  };

  if (/\b(producto|modelo|item|articulo|feature|servicio|service|card|plan|proyecto)\s+[a-d1-9]\b/i.test(source)) {
    add("La entrega usa nombres genericos tipo Producto A/Servicio 1/Feature 1; necesita nombres reales y especificos del pedido.");
  }

  if (/lorem ipsum|placeholder|coming soon|imagen pendiente|nombre del producto|your company|acme|demo company|example company/i.test(text)) {
    add("La entrega contiene placeholders visibles; debe parecer un negocio listo, no una demo.");
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
    "Prohibido Producto A/Modelo A/Servicio 1/Feature 1, placeholders, Acme, Lorem ipsum, picsum.photos, paisajes o imagenes aleatorias.",
    'Responde SOLO JSON { "reply": "...", "files": [...] } con App.tsx completo y archivos necesarios.',
  ].join("\n");
}
