import type { ParsedAppIdea } from "../../types/parsed-idea";

const BASE_FILES = [
  "package.json",
  "tsconfig.json",
  "drizzle.config.ts",
  ".env.example",
  "server/index.ts",
  "server/db.ts",
  "server/schema.ts",
  "server/middleware/auth.ts",
  "client/index.html",
  "client/vite.config.ts",
  "client/src/main.tsx",
  "client/src/App.tsx",
  "client/src/api/client.ts",
  "client/src/styles.css",
];

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "app";
}

export function buildSlug(title: string): string {
  return slugify(title);
}

export function buildOutputFiles(parsed: ParsedAppIdea): string[] {
  const files = new Set<string>(BASE_FILES);

  if (parsed.auth.required) {
    files.add("server/routes/auth.ts");
    files.add("client/src/pages/LoginPage.tsx");
    files.add("client/src/pages/RegisterPage.tsx");
    files.add("client/src/hooks/useAuth.ts");
  }

  for (const page of parsed.pages) {
    const component = page.name.replace(/[^a-zA-Z0-9]/g, "");
    if (component && !["Login", "Register"].includes(component)) {
      files.add(`client/src/pages/${component}Page.tsx`);
    }
  }

  switch (parsed.appType) {
    case "todo":
      files.add("server/routes/todos.ts");
      break;
    case "ecommerce":
      files.add("server/routes/products.ts");
      if (parsed.features.some((f) => f.id === "cart")) {
        files.add("server/routes/cart.ts");
      }
      files.add("server/seed/products.ts");
      break;
    case "blog":
      files.add("server/routes/posts.ts");
      files.add("server/seed/posts.ts");
      break;
    case "landing":
      files.add("server/routes/contact.ts");
      files.add("server/schema-contact.ts");
      break;
    case "saas":
    case "crm":
      files.add("server/routes/dashboard.ts");
      break;
    default:
      files.add("server/routes/health.ts");
  }

  return [...files].sort();
}
