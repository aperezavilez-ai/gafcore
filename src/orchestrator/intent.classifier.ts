import type { UserIntent, UserIntentKind, ProjectTypeHint } from "@/orchestrator/types";

const LANDING = /\b(landing|página de aterrizaje|hero|portada|presentación)\b/i;
const SHOP = /\b(tienda|e-?commerce|ecommerce|carrito|productos|shop)\b/i;
const FIX = /\b(arregla|corrige|fix|error|bug|no funciona|roto)\b/i;
const DEPLOY = /\b(despliega|deploy|publicar en (vercel|producción)|poner en vivo)\b/i;
const DOCS = /\b(documenta|readme|documentación|changelog)\b/i;
const CHAT = /\b(explica|qué es|cómo funciona|solo (responde|chat)|sin código)\b/i;
const VISUAL = /\b(solo (estilo|css|color|diseño)|edición visual|ui sola)\b/i;

/**
 * Clasificador MVP por reglas (sin LLM). Sustituible por modelo ligero en O8.
 */
export function classifyUserIntent(
  instruction: string,
  options?: { mode?: "build" | "chat"; visualEdit?: boolean },
): UserIntent {
  const text = instruction.trim();
  let kind: UserIntentKind = options?.mode === "chat" ? "chat" : "build";
  let projectType: ProjectTypeHint = "unknown";
  let confidence = 0.55;

  if (CHAT.test(text)) {
    kind = "chat";
    confidence = 0.72;
  } else if (DEPLOY.test(text)) {
    kind = "deploy";
    confidence = 0.7;
  } else if (DOCS.test(text)) {
    kind = "docs";
    confidence = 0.68;
  } else if (FIX.test(text)) {
    kind = "fix";
    confidence = 0.75;
  }

  if (SHOP.test(text)) {
    projectType = "ecommerce";
    confidence = Math.max(confidence, 0.7);
  } else if (LANDING.test(text)) {
    projectType = "landing";
    confidence = Math.max(confidence, 0.68);
  } else if (
    /\b(p[aá]gina|pagina|sitio|web|estudio|tatu|restaurante|hotel|cl[ií]nica|negocio|empresa|marca|sal[oó]n|barber|gym|gimnasio)\b/i.test(
      text,
    )
  ) {
    projectType = "landing";
    confidence = Math.max(confidence, 0.66);
  } else if (/\b(dashboard|panel de control|métricas|kpi|sidebar)\b/i.test(text)) {
    projectType = "app";
    confidence = Math.max(confidence, 0.72);
  } else if (/\b(app|aplicación|panel)\b/i.test(text)) {
    projectType = "app";
    confidence = Math.max(confidence, 0.6);
  } else if (/\b(desde cero|vacío|blank|nuevo proyecto)\b/i.test(text)) {
    projectType = "blank";
    kind = "template";
    confidence = 0.65;
  }

  const visualOnly = Boolean(options?.visualEdit) || VISUAL.test(text);

  return {
    kind,
    projectType,
    confidence,
    flags: {
      visualOnly,
      needsDeploy: kind === "deploy" || DEPLOY.test(text),
      needsDocs: kind === "docs" || DOCS.test(text),
    },
  };
}
