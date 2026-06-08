/**
 * Salida estructurada del Input Parser (módulo 1).
 */

export type AppType =
  | "todo"
  | "ecommerce"
  | "blog"
  | "landing"
  | "saas"
  | "crm"
  | "custom";

export type AuthMethod = "email_password" | "magic_link" | "oauth";

export type FieldType = "string" | "text" | "number" | "boolean" | "datetime" | "uuid" | "json";

export type ParsedEntityField = {
  name: string;
  type: FieldType;
  required: boolean;
  unique?: boolean;
};

export type ParsedEntity = {
  name: string;
  tableName: string;
  description: string;
  fields: ParsedEntityField[];
};

export type ParsedPage = {
  route: string;
  name: string;
  purpose: string;
  requiresAuth: boolean;
};

export type ParsedFeature = {
  id: string;
  name: string;
  description: string;
  /** Debe tener implementación real en backend + frontend */
  functional: true;
};

export type ParsedAuth = {
  required: boolean;
  methods: AuthMethod[];
};

export type ParsedAppIdea = {
  /** Texto original del usuario */
  raw: string;
  /** Nombre corto del proyecto */
  title: string;
  /** Resumen en una frase */
  summary: string;
  appType: AppType;
  complexity: "simple" | "medium" | "complex";
  auth: ParsedAuth;
  pages: ParsedPage[];
  features: ParsedFeature[];
  entities: ParsedEntity[];
  /** Palabras clave detectadas (debug / blueprint) */
  keywords: string[];
  constraints: {
    mustBeFunctional: true;
    noMocks: true;
    runnableLocally: true;
  };
};
