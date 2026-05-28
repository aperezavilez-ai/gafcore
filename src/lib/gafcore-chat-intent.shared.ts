/**
 * Detección de intención conversacional vs construcción (chat IDE).
 */
import { resolveHeroImageFromInstruction } from "@/lib/gafcore-hero-image.shared";

export { resolveHeroImageFromInstruction } from "@/lib/gafcore-hero-image.shared";
export type { HeroImageTheme } from "@/lib/gafcore-hero-image.shared";

const GREETING_RE =
  /^(hola|hola!?|buenas|buenos\s+d[ií]as|buenas\s+tardes|buenas\s+noches|hey|hi|hello|qu[eé]\s+tal|saludos|gracias|thank\s+you|ok|vale|perfecto|genial|listo)[\s!.?,:]*$/i;

const THANKS_RE = /^(muchas\s+gracias|gracias|thanks)[\s!.?]*$/i;

/** Saludo, agradecimiento o mensaje social sin pedido de código. */
export function isConversationalOnly(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 120) return false;
  if (GREETING_RE.test(t) || THANKS_RE.test(t)) return true;
  if (
    /^(c[oó]mo\s+est[aá]s|qui[eé]n\s+eres|qu[eé]\s+eres|ayuda|help)[\s!.?]*$/i.test(t)
  ) {
    return true;
  }
  return false;
}

/** Pedido sustantivo de producto / UI (no solo saludo). */
export function isSubstantiveBuildRequest(text: string): boolean {
  const t = text.trim();
  if (t.length < 8) return false;
  return /crea|genera|haz|hazme|monta|levanta|añade|agrega|modifica|cambia|landing|tienda|app|aplicaci[oó]n|p[aá]gina|dise[ñn]|imagen|vuelo|viaje|formulario|registro|proyecto|estudio|tatu|m[oó]dulo|sistema|dashboard|saas|web|sitio|profesional/i.test(
    t,
  );
}

/** Respuesta de la IA que solo planifica (sin código) — no debe quedarse en preview de bienvenida. */
export function aiReplyLooksLikePlanOnly(reply: string): boolean {
  const t = reply.trim();
  if (t.length < 200) return false;
  const planSignals =
    (/\b(m[oó]dulo|fase|estructura de carpetas|arquitectura|stack|tailwind|lucide)\b/i.test(t) &&
      /\b(components|views|hooks|admin|cliente|dashboard)\b/i.test(t)) ||
    /\bFASE\s*\d/i.test(t) ||
    /\b\d+\)\s/m.test(t);
  const hasCodeFence = /```/.test(t);
  return planSignals && !hasCodeFence;
}

export function buildConversationalInstructionPrefix(userText: string): string {
  return (
    "[CONVERSACIÓN GafCore] El usuario escribe en tono social o saludo: \"" +
    userText.slice(0, 80) +
    "\". Responde en español con calidez y naturalidad (2-4 frases). " +
    "Preséntate brevemente como asistente de GafCore para crear y mejorar su sitio/app. " +
    "Pregunta qué quiere construir o mejorar. Devuelve files: [] si no pide código. " +
    "PROHIBIDO decir «no se hicieron cambios», «indica qué modificar» de forma fría, o tono de error. "
  );
}

/** Cambio visual de hero/fondo (p. ej. azul → foto). */
export function userWantsHeroBackgroundChange(text: string): boolean {
  return /fondo|background|banner|hero|recuadro|cuadro|bloque|ciudad|city|skyline|cielo|avion|avión|imagen\s+de|foto\s+de|azul|sustituye?|cambiar?|pon\s+.*foto/i.test(
    text,
  );
}

export function buildHeroBackgroundInstructionPrefix(userText: string): string {
  if (!userWantsHeroBackgroundChange(userText)) return "";
  const theme = resolveHeroImageFromInstruction(userText);
  const literal = userText.trim().slice(0, 280);
  // Solo damos URL si el vertical es de foto natural (viajes, paisaje, comida, etc.).
  if (theme.matched && theme.url) {
    return (
      `[HERO IMAGEN — PEDIDO LITERAL] El usuario pidió: «${literal}». ` +
      `Implementa EXACTAMENTE eso en el hero (${theme.descriptionEs}). ` +
      `PROHIBIDO sustituir por otra escena (si pidió cielo/avión, NO uses skyline de ciudad). ` +
      `URL obligatoria del fondo: ${theme.url} — style backgroundImage o <img> absolute inset-0 object-cover bajo el texto. ` +
      `Quita fondos azules/sólidos del hero. Conserva buscador, registro y secciones existentes salvo que pida quitarlas. `
    );
  }
  // Producto digital / SaaS / app: NO meter foto random. Mockup del producto en JSX.
  return (
    `[HERO PREMIUM — PEDIDO LITERAL] El usuario pidió: «${literal}». ` +
    `Implementa el hero al estilo SaaS premium (Linear/Vercel/Stripe): orbs blur de fondo, eyebrow pill, ` +
    `h1 grande con palabra clave en gradient bg-clip-text, lead, 2 CTAs, social proof, y un MOCKUP DEL PRODUCTO ` +
    `construido en JSX/Tailwind a la derecha (browser/phone frame con la UI real adentro). ` +
    `PROHIBIDO usar fotos de paisaje, río, montaña, atardecer u otra imagen random — el hero NO es una foto. `
  );
}

/** Refuerzo cuando el usuario describe un cambio visual concreto (evita confundir con ciudad genérica). */
export function buildLiteralVisualChangePrefix(userText: string): string {
  const t = userText.trim();
  if (!/cambia|modifica|sustituye?|reemplaza|pon\s+|quita\s+el\s+azul|recuadro|foto\s+de/i.test(t)) {
    return "";
  }
  if (!/fondo|hero|banner|imagen|foto|cielo|avion|avión|color|azul|visual/i.test(t)) {
    return "";
  }
  const theme = resolveHeroImageFromInstruction(t);
  if (theme.matched && theme.url) {
    return (
      `[CAMBIO VISUAL LITERAL] Respeta al pie de la letra: «${t.slice(0, 220)}». ` +
      `Si aplica al hero, usa ${theme.url} (${theme.descriptionEs}). No inventes otra escena ni respondas solo con texto. ` +
      `Devuelve el archivo del hero/App modificado en files[]. `
    );
  }
  return (
    `[CAMBIO VISUAL LITERAL] Respeta al pie de la letra: «${t.slice(0, 220)}». ` +
    `Si aplica al hero y el producto es digital, sustituye por un mockup en JSX (no foto random). ` +
    `Devuelve el archivo del hero/App modificado en files[]. `
  );
}

/** Tweak visual: no gastar 2ª llamada IA en validación funcional pesada. */
export function isVisualOnlyTweak(text: string): boolean {
  const t = text.toLowerCase();
  if (/registro|base\s+de\s+datos|api|backend|auth|persistencia/i.test(t)) return false;
  return /fondo|background|color|azul|imagen|ciudad|cielo|avion|avión|banner|hero|recuadro|estilo|visual|diseño|foto/i.test(
    t,
  );
}

export function buildCreativeBuildPrefix(userText: string): string {
  if (!isSubstantiveBuildRequest(userText)) return "";
  const theme = resolveHeroImageFromInstruction(userText);
  const isPhotoVertical = theme.matched;
  if (isPhotoVertical) {
    return (
      "[CREATIVIDAD OBLIGATORIA] El usuario pide un producto concreto — no entregues la misma pantalla genérica. " +
      `Hero con foto temática (${theme.descriptionEs}) usando ${theme.url}, secciones distintas, tipografía cuidada, UI premium. ` +
      "Aplica densidad visual (orbs blur, gradientes, glass cards, social proof). Implementa el pedido literal del usuario. "
    );
  }
  return (
    "[CREATIVIDAD OBLIGATORIA — SAAS PREMIUM] El usuario pide un producto digital. " +
    "PROHIBIDO usar foto random de paisaje/río/montaña/atardecer en el hero. " +
    "Hero estilo Linear/Vercel/Stripe: orbs blur de fondo, eyebrow pill con icono, h1 grande con una palabra clave en gradient bg-clip-text, " +
    "lead, 2 CTAs (primario sólido + ghost), social proof (avatares + stat) Y a la derecha un MOCKUP del producto construido en JSX (browser/phone frame con la UI real). " +
    "Sigue con: stats row, bento grid de features, sección 'cómo funciona' en pasos, testimonios, pricing si aplica, FAQ, CTA final con gradient premium y orbs, footer rico. " +
    "Tipografía: Inter + Space Grotesk (o Geist). Paleta limitada (1 acento + neutros). Densidad visual obligatoria. "
  );
}

/** Sustituye respuestas robóticas cuando el usuario solo saludó. */
/** No reutilizar caché de respuesta para saludos ni modo chat social. */
export function shouldBypassGafcoreChatCache(instruction: string): boolean {
  const t = instruction.trim();
  if (/^\[CONVERSACIÓN GafCore\]/i.test(t)) return true;
  if (/^\[Modo chat\]/i.test(t) && !/\[FUNCTIONAL-FIRST\]/i.test(t)) return true;
  if (userWantsHeroBackgroundChange(t) || (isVisualOnlyTweak(t) && /cambia|modifica|aplica|hero|fondo/i.test(t))) {
    return true;
  }
  const quoted = t.match(/El usuario escribe[^"]*"([^"]{1,120})"/i);
  if (quoted?.[1] && isConversationalOnly(quoted[1])) return true;
  return false;
}

export function softenRoboticReply(userText: string, reply: string): string {
  const conversational =
    isConversationalOnly(userText) || /^\[CONVERSACIÓN GafCore\]/i.test(userText.trim());
  if (!conversational) return reply;
  const cold =
    /no\s+se\s+hicieron\s+cambios|indica\s+qu[eé]\s+necesitas\s+modificar|sin\s+cambios\s+en\s+los\s+archivos/i;
  if (cold.test(reply)) {
    return (
      "¡Hola! Me alegra saludarte. Soy tu asistente en GafCore y puedo ayudarte a crear o mejorar tu sitio y tu app paso a paso. " +
      "Cuéntame qué tienes en mente — por ejemplo una landing, una tienda o una agencia de viajes — y lo construimos juntos."
    );
  }
  return reply;
}
