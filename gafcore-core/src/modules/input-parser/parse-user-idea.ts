import type { ParsedAppIdea } from "../../types/parsed-idea";
import {
  detectAppType,
  detectAuthMethods,
  detectAuthRequired,
  detectComplexity,
  extractKeywords,
  inferEntities,
  inferFeatures,
  inferPages,
  inferTitle,
} from "./patterns";
import { parsedAppIdeaSchema } from "./schema";

export type ParseUserIdeaOptions = {
  /** Si true, lanza ZodError cuando la salida no cumple el esquema */
  strict?: boolean;
};

/**
 * Módulo 1 — Input Parser
 * Convierte una idea en lenguaje natural a JSON estructurado listo para el Blueprint Generator.
 */
export function parseUserIdea(raw: string, options: ParseUserIdeaOptions = {}): ParsedAppIdea {
  const text = raw.trim();
  if (!text) {
    throw new Error("parseUserIdea: empty input");
  }

  const appType = detectAppType(text);
  const authRequired = detectAuthRequired(text);
  const authMethods = detectAuthMethods(text);
  const complexity = detectComplexity(text, appType);
  const title = inferTitle(text, appType);
  const entities = inferEntities(appType, text);
  const pages = inferPages(appType, authRequired, text);
  const features = inferFeatures(appType, text, authRequired);
  const keywords = extractKeywords(text);

  const result: ParsedAppIdea = {
    raw: text,
    title,
    summary: buildSummary(title, appType, authRequired, features.length),
    appType,
    complexity,
    auth: {
      required: authRequired,
      methods: authMethods,
    },
    pages,
    features,
    entities,
    keywords,
    constraints: {
      mustBeFunctional: true,
      noMocks: true,
      runnableLocally: true,
    },
  };

  if (options.strict) {
    return parsedAppIdeaSchema.parse(result);
  }

  return result;
}

function buildSummary(
  title: string,
  appType: ParsedAppIdea["appType"],
  authRequired: boolean,
  featureCount: number,
): string {
  const authPart = authRequired ? " con autenticación" : "";
  return `${title}: app tipo ${appType}${authPart}, ${featureCount} feature(s) funcionales detectadas.`;
}
