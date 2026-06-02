/**
 * Provisión de proyectos desde el chat IDE (crear / cambiar de canvas).
 */
import { isSubstantiveBuildRequest } from "@/lib/gafcore-chat-intent.shared";
import { isGafcoreDefaultTemplateApp } from "@/lib/gafcore-project-stale.shared";

export type ChatProjectFile = { name: string; content: string; language?: string };

/** El usuario pide un producto nuevo distinto al que ya hay en el canvas. */
export function userWantsFreshProject(
  instruction: string,
  contextFiles: ChatProjectFile[],
): boolean {
  const t = instruction.trim();
  if (
    /\b(nuevo proyecto|otro proyecto|proyecto nuevo|proyecto distinto|proyecto diferente|nueva app|nueva aplicaci[oó]n|empezar de cero|desde cero)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (!isSubstantiveBuildRequest(t)) return false;

  const app = contextFiles.find((f) => /^app\.(tsx|jsx)$/i.test(f.name));
  const hasBuiltProject = Boolean(app?.content && !isGafcoreDefaultTemplateApp(app.content));
  if (!hasBuiltProject) return false;

  if (/\b(reemplaza|rehaz|reescribe todo|vuelve a crear|otra cosa|en su lugar)\b/i.test(t)) {
    return true;
  }

  return (
    /\b(crea|hazme|genera|construye|monta|desarrolla)\s+(un[a]?\s+)?/i.test(t) &&
    /\b(landing|sitio|web|app|tienda|p[aá]gina|aplicaci[oó]n|dashboard|negocio|empresa|marca)\b/i.test(
      t,
    )
  );
}

/** Reconstruir en el mismo proyecto sin crear fila nueva en Supabase. */
export function userWantsInPlaceRebuild(instruction: string): boolean {
  return /\b(reemplaza todo|rehaz todo|reescribe todo|desde cero|empezar de cero|borra todo|nuevo diseño)\b/i.test(
    instruction.trim(),
  );
}

export function suggestProjectNameFromInstruction(instruction: string): string {
  const t = instruction.trim();
  const quoted = t.match(/[«"']([^»"']{3,72})[»"']/);
  if (quoted?.[1]) return quoted[1].trim().slice(0, 80);

  const afterVerb = t.match(
    /(?:crea|hazme|genera|construye|monta|desarrolla)\s+(?:un[a]?\s+)?(?:landing|sitio|web|app|p[aá]gina|tienda)?\s*(?:de|para)?\s*([^.!?\n]{3,72})/i,
  );
  if (afterVerb?.[1]) {
    const name = afterVerb[1].replace(/\s+(con|y|que|usando)\s+.*$/i, "").trim();
    if (name.length >= 3) return name.slice(0, 80);
  }

  const keywords: Array<[RegExp, string]> = [
    [/restaurante/i, "Restaurante"],
    [/tatu/i, "Estudio de tatuajes"],
    [/hotel/i, "Hotel"],
    [/cl[ií]nica|dentista|m[eé]dico/i, "Clínica"],
    [/gimnasio|gym|fitness/i, "Gimnasio"],
    [/barber|peluquer/i, "Barbería"],
    [/tienda|e-?commerce|shop/i, "Mi tienda"],
    [/viaje|vuelo|turismo|agencia/i, "Agencia de viajes"],
    [/inmobiliaria|inmueble/i, "Inmobiliaria"],
    [/abogad|legal/i, "Despacho legal"],
    [/saas|software|startup/i, "SaaS"],
    [/portfolio|portafolio/i, "Portfolio"],
    [/landing/i, "Mi landing"],
  ];
  for (const [re, label] of keywords) {
    if (re.test(t)) return label;
  }

  const date = new Date().toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
  return `Proyecto ${date}`;
}

export function resolveTemplateSlugForChatInstruction(_instruction: string): string {
  return "blank-vite";
}

export function buildFreshProjectInstructionPrefix(): string {
  return (
    "[PROYECTO NUEVO GafCore] Canvas limpio. " +
    "Construye el producto pedido desde cero en App.tsx (export default). " +
    "PROHIBIDO mezclar con proyectos anteriores ni conservar secciones ajenas al pedido. " +
    "Responde SOLO JSON { reply, files } con código completo. "
  );
}
