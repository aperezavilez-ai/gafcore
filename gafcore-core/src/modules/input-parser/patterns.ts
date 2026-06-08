import type { AppType, AuthMethod, ParsedEntity, ParsedFeature, ParsedPage } from "../../types/parsed-idea";

const AUTH_RE =
  /\b(login|log\s*in|sign\s*in|sign\s*up|signup|register|registro|auth|autenticaci[oó]n|cuenta|usuario|usuarios|sesi[oó]n)\b/i;

const CART_RE = /\b(carrito|cart|checkout|pago|pagos|stripe)\b/i;
const TODO_RE = /\b(todo|tarea|task|checklist|pendiente)\b/i;
const SHOP_RE = /\b(tienda|shop|e-?commerce|venta|vender|producto|cat[aá]logo|zapato|calzado|ropa)\b/i;
const BLOG_RE = /\b(blog|art[ií]culo|post|noticia|publicar\s+texto)\b/i;
const LANDING_RE = /\b(landing|p[aá]gina\s+de\s+venta|one\s*page|presentaci[oó]n)\b/i;
const SAAS_RE = /\b(saas|dashboard|panel|admin|suscripci[oó]n|subscription)\b/i;
const CRM_RE = /\b(crm|cliente|lead|contacto|pipeline)\b/i;

export function detectAuthRequired(text: string): boolean {
  return AUTH_RE.test(text);
}

export function detectAuthMethods(text: string): AuthMethod[] {
  if (!AUTH_RE.test(text)) return [];
  const methods: AuthMethod[] = ["email_password"];
  if (/\b(oauth|google|github|magic\s*link)\b/i.test(text)) {
    if (/magic\s*link/i.test(text)) methods.push("magic_link");
    if (/oauth|google|github/i.test(text)) methods.push("oauth");
  }
  return [...new Set(methods)];
}

export function detectAppType(text: string): AppType {
  const t = text.toLowerCase();
  if (TODO_RE.test(t)) return "todo";
  if (SHOP_RE.test(t) || CART_RE.test(t)) return "ecommerce";
  if (BLOG_RE.test(t)) return "blog";
  if (CRM_RE.test(t)) return "crm";
  if (SAAS_RE.test(t)) return "saas";
  if (LANDING_RE.test(t)) return "landing";
  return "custom";
}

export function detectComplexity(text: string, appType: AppType): "simple" | "medium" | "complex" {
  const signals =
    (AUTH_RE.test(text) ? 1 : 0) +
    (CART_RE.test(text) ? 1 : 0) +
    (/\b(api|base\s+de\s+datos|database|supabase|stripe|pago)\b/i.test(text) ? 2 : 0) +
    (text.length > 160 ? 1 : 0) +
    (appType === "saas" || appType === "crm" ? 2 : 0);
  if (signals >= 4) return "complex";
  if (signals >= 2) return "medium";
  return "simple";
}

export function extractKeywords(text: string): string[] {
  const found = new Set<string>();
  const rules: Array<[RegExp, string]> = [
    [AUTH_RE, "auth"],
    [CART_RE, "cart"],
    [TODO_RE, "todo"],
    [SHOP_RE, "shop"],
    [BLOG_RE, "blog"],
    [LANDING_RE, "landing"],
    [SAAS_RE, "saas"],
    [CRM_RE, "crm"],
    [/\b(filtro|filter|buscar|search)\b/i, "search"],
    [/\b(notificaci[oó]n|notification)\b/i, "notifications"],
  ];
  for (const [re, kw] of rules) {
    if (re.test(text)) found.add(kw);
  }
  return [...found];
}

export function inferTitle(text: string, appType: AppType): string {
  const cleaned = text
    .replace(/^(hazme|crea|genera|quiero|necesito|make|build)\s+(una?\s+)?/i, "")
    .trim();
  const slice = cleaned.slice(0, 60).trim();
  if (slice.length >= 4) {
    return slice.charAt(0).toUpperCase() + slice.slice(1);
  }
  const defaults: Record<AppType, string> = {
    todo: "Todo App",
    ecommerce: "Online Store",
    blog: "Blog",
    landing: "Landing Page",
    saas: "SaaS App",
    crm: "CRM",
    custom: "My App",
  };
  return defaults[appType];
}

export function inferEntities(appType: AppType, text: string): ParsedEntity[] {
  const userEntity: ParsedEntity = {
    name: "User",
    tableName: "users",
    description: "Usuario autenticado",
    fields: [
      { name: "id", type: "uuid", required: true, unique: true },
      { name: "email", type: "string", required: true, unique: true },
      { name: "passwordHash", type: "string", required: true },
      { name: "createdAt", type: "datetime", required: true },
    ],
  };

  switch (appType) {
    case "todo":
      return [
        ...(AUTH_RE.test(text) ? [userEntity] : []),
        {
          name: "Todo",
          tableName: "todos",
          description: "Tarea del usuario",
          fields: [
            { name: "id", type: "uuid", required: true, unique: true },
            ...(AUTH_RE.test(text) ? [{ name: "userId", type: "uuid" as const, required: true }] : []),
            { name: "title", type: "string", required: true },
            { name: "completed", type: "boolean", required: true },
            { name: "createdAt", type: "datetime", required: true },
          ],
        },
      ];
    case "ecommerce":
      return [
        ...(AUTH_RE.test(text) ? [userEntity] : []),
        {
          name: "Product",
          tableName: "products",
          description: "Producto en catálogo",
          fields: [
            { name: "id", type: "uuid", required: true, unique: true },
            { name: "name", type: "string", required: true },
            { name: "price", type: "number", required: true },
            { name: "imageUrl", type: "string", required: false },
            { name: "stock", type: "number", required: true },
          ],
        },
        ...(CART_RE.test(text)
          ? [
              {
                name: "CartItem",
                tableName: "cart_items",
                description: "Línea del carrito",
                fields: [
                  { name: "id", type: "uuid" as const, required: true, unique: true },
                  { name: "productId", type: "uuid" as const, required: true },
                  { name: "quantity", type: "number" as const, required: true },
                  ...(AUTH_RE.test(text)
                    ? [{ name: "userId", type: "uuid" as const, required: true }]
                    : [{ name: "sessionId", type: "string" as const, required: true }]),
                ],
              },
            ]
          : []),
      ];
    case "blog":
      return [
        ...(AUTH_RE.test(text) ? [userEntity] : []),
        {
          name: "Post",
          tableName: "posts",
          description: "Artículo del blog",
          fields: [
            { name: "id", type: "uuid", required: true, unique: true },
            { name: "title", type: "string", required: true },
            { name: "body", type: "text", required: true },
            { name: "publishedAt", type: "datetime", required: true },
            ...(AUTH_RE.test(text) ? [{ name: "authorId", type: "uuid" as const, required: true }] : []),
          ],
        },
      ];
    default:
      return AUTH_RE.test(text) ? [userEntity] : [];
  }
}

export function inferPages(appType: AppType, authRequired: boolean, text: string): ParsedPage[] {
  const authPages: ParsedPage[] = authRequired
    ? [
        { route: "/login", name: "Login", purpose: "Iniciar sesión", requiresAuth: false },
        { route: "/register", name: "Register", purpose: "Crear cuenta", requiresAuth: false },
      ]
    : [];

  switch (appType) {
    case "todo":
      return [
        ...authPages,
        { route: "/", name: "Todos", purpose: "Listar y gestionar tareas", requiresAuth: authRequired },
      ];
    case "ecommerce": {
      const pages: ParsedPage[] = [
        ...authPages,
        { route: "/", name: "Catalog", purpose: "Catálogo de productos", requiresAuth: false },
      ];
      if (CART_RE.test(text)) {
        pages.push({
          route: "/cart",
          name: "Cart",
          purpose: "Carrito de compras",
          requiresAuth: false,
        });
      }
      return pages;
    }
    case "blog":
      return [
        ...authPages,
        { route: "/", name: "Home", purpose: "Listado de artículos", requiresAuth: false },
        { route: "/posts/:id", name: "Post", purpose: "Detalle del artículo", requiresAuth: false },
      ];
    case "landing":
      return [{ route: "/", name: "Landing", purpose: "Página principal de conversión", requiresAuth: false }];
    case "saas":
    case "crm":
      return [
        ...authPages,
        { route: "/", name: "Dashboard", purpose: "Panel principal", requiresAuth: true },
      ];
    default:
      return [
        ...authPages,
        { route: "/", name: "Home", purpose: "Página principal", requiresAuth: false },
      ];
  }
}

export function inferFeatures(
  appType: AppType,
  text: string,
  authRequired: boolean,
): ParsedFeature[] {
  const features: ParsedFeature[] = [];

  if (authRequired) {
    features.push({
      id: "auth",
      name: "Authentication",
      description: "Registro, login y sesión persistente con backend real",
      functional: true,
    });
  }

  switch (appType) {
    case "todo":
      features.push(
        {
          id: "todo-crud",
          name: "Todo CRUD",
          description: "Crear, listar, marcar completado y eliminar tareas vía API",
          functional: true,
        },
        {
          id: "todo-persist",
          name: "Database persistence",
          description: "Tareas guardadas en base de datos, no en memoria mock",
          functional: true,
        },
      );
      break;
    case "ecommerce":
      features.push({
        id: "catalog",
        name: "Product catalog",
        description: "Listado de productos desde base de datos",
        functional: true,
      });
      if (CART_RE.test(text)) {
        features.push({
          id: "cart",
          name: "Shopping cart",
          description: "Añadir/quitar productos y calcular total con API",
          functional: true,
        });
      }
      break;
    case "blog":
      features.push({
        id: "posts-crud",
        name: "Posts",
        description: "Publicar y listar artículos con API y DB",
        functional: true,
      });
      break;
    case "landing":
      features.push({
        id: "landing-cta",
        name: "Landing CTA",
        description: "Formulario de contacto con handler real (guarda en DB o envía email)",
        functional: true,
      });
      break;
    default:
      features.push({
        id: "core-page",
        name: "Core page",
        description: "Página principal con datos reales del backend",
        functional: true,
      });
  }

  return features;
}
