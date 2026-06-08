import type { ParsedAppIdea } from "../../types/parsed-idea";
import type { BlueprintApiRoute } from "../../types/blueprint";

function authRoutes(): BlueprintApiRoute[] {
  return [
    {
      method: "POST",
      path: "/api/auth/register",
      handler: "auth.register",
      auth: false,
      description: "Crear cuenta con email y contraseña",
    },
    {
      method: "POST",
      path: "/api/auth/login",
      handler: "auth.login",
      auth: false,
      description: "Iniciar sesión y obtener cookie de sesión",
    },
    {
      method: "POST",
      path: "/api/auth/logout",
      handler: "auth.logout",
      auth: true,
      description: "Cerrar sesión",
    },
    {
      method: "GET",
      path: "/api/auth/me",
      handler: "auth.me",
      auth: true,
      entity: "User",
      description: "Usuario autenticado actual",
    },
  ];
}

function crudRoutes(entity: string, tableName: string, pathSegment: string): BlueprintApiRoute[] {
  const base = `/api/${pathSegment}`;
  return [
    {
      method: "GET",
      path: base,
      handler: `${tableName}.list`,
      auth: false,
      entity,
      description: `Listar ${entity}`,
    },
    {
      method: "POST",
      path: base,
      handler: `${tableName}.create`,
      auth: false,
      entity,
      description: `Crear ${entity}`,
    },
    {
      method: "PATCH",
      path: `${base}/:id`,
      handler: `${tableName}.update`,
      auth: false,
      entity,
      description: `Actualizar ${entity}`,
    },
    {
      method: "DELETE",
      path: `${base}/:id`,
      handler: `${tableName}.delete`,
      auth: false,
      entity,
      description: `Eliminar ${entity}`,
    },
  ];
}

function todoRoutes(authRequired: boolean): BlueprintApiRoute[] {
  const routes = crudRoutes("Todo", "todos", "todos");
  if (authRequired) {
    return routes.map((r) => ({ ...r, auth: true }));
  }
  return routes;
}

function ecommerceRoutes(parsed: ParsedAppIdea): BlueprintApiRoute[] {
  const routes: BlueprintApiRoute[] = [
    {
      method: "GET",
      path: "/api/products",
      handler: "products.list",
      auth: false,
      entity: "Product",
      description: "Catálogo de productos",
    },
    {
      method: "GET",
      path: "/api/products/:id",
      handler: "products.get",
      auth: false,
      entity: "Product",
      description: "Detalle de producto",
    },
  ];

  if (parsed.features.some((f) => f.id === "cart")) {
    routes.push(
      {
        method: "GET",
        path: "/api/cart",
        handler: "cart.get",
        auth: parsed.auth.required,
        entity: "CartItem",
        description: "Carrito actual",
      },
      {
        method: "POST",
        path: "/api/cart/items",
        handler: "cart.addItem",
        auth: parsed.auth.required,
        entity: "CartItem",
        description: "Añadir producto al carrito",
      },
      {
        method: "PATCH",
        path: "/api/cart/items/:id",
        handler: "cart.updateItem",
        auth: parsed.auth.required,
        entity: "CartItem",
        description: "Cambiar cantidad",
      },
      {
        method: "DELETE",
        path: "/api/cart/items/:id",
        handler: "cart.removeItem",
        auth: parsed.auth.required,
        entity: "CartItem",
        description: "Quitar del carrito",
      },
    );
  }

  return routes;
}

function blogRoutes(authRequired: boolean): BlueprintApiRoute[] {
  const routes: BlueprintApiRoute[] = [
    {
      method: "GET",
      path: "/api/posts",
      handler: "posts.list",
      auth: false,
      entity: "Post",
      description: "Listado de artículos",
    },
    {
      method: "GET",
      path: "/api/posts/:id",
      handler: "posts.get",
      auth: false,
      entity: "Post",
      description: "Detalle del artículo",
    },
  ];
  if (authRequired) {
    routes.push({
      method: "POST",
      path: "/api/posts",
      handler: "posts.create",
      auth: true,
      entity: "Post",
      description: "Publicar artículo",
    });
  }
  return routes;
}

function landingRoutes(): BlueprintApiRoute[] {
  return [
    {
      method: "POST",
      path: "/api/contact",
      handler: "contact.submit",
      auth: false,
      description: "Enviar formulario de contacto (guarda en DB)",
    },
  ];
}

export function buildApiRoutes(parsed: ParsedAppIdea): BlueprintApiRoute[] {
  const routes: BlueprintApiRoute[] = [];

  if (parsed.auth.required) {
    routes.push(...authRoutes());
  }

  switch (parsed.appType) {
    case "todo":
      routes.push(...todoRoutes(parsed.auth.required));
      break;
    case "ecommerce":
      routes.push(...ecommerceRoutes(parsed));
      break;
    case "blog":
      routes.push(...blogRoutes(parsed.auth.required));
      break;
    case "landing":
      routes.push(...landingRoutes());
      break;
    case "saas":
    case "crm":
      routes.push({
        method: "GET",
        path: "/api/dashboard",
        handler: "dashboard.summary",
        auth: true,
        description: "Resumen del panel",
      });
      break;
    default:
      routes.push({
        method: "GET",
        path: "/api/health",
        handler: "health.check",
        auth: false,
        description: "Estado del backend",
      });
  }

  return routes;
}
