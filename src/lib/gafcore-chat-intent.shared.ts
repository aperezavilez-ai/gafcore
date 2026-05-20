/**
 * Detección de intención conversacional vs construcción (chat IDE).
 */

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
  if (t.length < 12) return false;
  return /crea|genera|haz|añade|agrega|modifica|cambia|landing|tienda|app|p[aá]gina|dise[ñn]|imagen|vuelo|viaje|formulario|registro|base\s+de\s+datos|profesional/i.test(
    t,
  );
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

/** Cambio visual de hero/fondo (p. ej. azul → foto de ciudad). */
export function userWantsHeroBackgroundChange(text: string): boolean {
  return /fondo|background|banner|hero|ciudad|city|skyline|imagen\s+de|azul|sustituye?\s+el\s+fondo|cambiar?\s+el\s+fondo/i.test(
    text,
  );
}

export function buildHeroBackgroundInstructionPrefix(userText: string): string {
  if (!userWantsHeroBackgroundChange(userText)) return "";
  return (
    "[HERO CON IMAGEN] El usuario pide foto de ciudad/fondo en el hero, NO un bloque azul plano. " +
    "Usa style backgroundImage: url('https://picsum.photos/seed/gafcore-travel-city/1280/720') con bg-cover bg-center " +
    "o <img> absolute inset-0 object-cover bajo el texto. Mantén buscador de vuelos y registro si ya existen. "
  );
}

/** Tweak visual: no gastar 2ª llamada IA en validación funcional pesada. */
export function isVisualOnlyTweak(text: string): boolean {
  const t = text.toLowerCase();
  if (/registro|base\s+de\s+datos|api|backend|auth|persistencia/i.test(t)) return false;
  return /fondo|background|color|azul|imagen|ciudad|banner|hero|estilo|visual|diseño/i.test(t);
}

export function buildCreativeBuildPrefix(userText: string): string {
  if (!isSubstantiveBuildRequest(userText)) return "";
  return (
    "[CREATIVIDAD OBLIGATORIA] El usuario pide un producto concreto — no entregues la misma pantalla genérica de siempre. " +
    "Hero con imagen https://picsum.photos/seed/ temática al negocio, secciones distintas, tipografía cuidada, UI premium. " +
    "Si piden agencia de viajes: banner con foto de viaje, buscador ida/vuelta, registro con estado real. " +
    "Implementa el pedido literal del usuario en esta respuesta. "
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
