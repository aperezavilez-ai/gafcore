import type { EmitContext, GeneratedFile } from "../types";

export function emitServerCore(ctx: EmitContext): GeneratedFile[] {
  const { blueprint } = ctx;
  const auth = blueprint.parsed.auth.required;
  const appType = blueprint.parsed.appType;
  const hasCart = blueprint.parsed.features.some((f) => f.id === "cart");

  const routeImports: string[] = [];
  const routeMounts: string[] = [];

  if (auth) {
    routeImports.push('import { authRouter } from "./routes/auth.js";');
    routeMounts.push('app.use("/api/auth", authRouter);');
  }

  switch (appType) {
    case "todo":
      routeImports.push('import { todosRouter } from "./routes/todos.js";');
      routeMounts.push('app.use("/api/todos", todosRouter);');
      break;
    case "ecommerce":
      routeImports.push('import { productsRouter } from "./routes/products.js";');
      routeMounts.push('app.use("/api/products", productsRouter);');
      if (hasCart) {
        routeImports.push('import { cartRouter } from "./routes/cart.js";');
        routeMounts.push('app.use("/api/cart", cartRouter);');
      }
      break;
    case "blog":
      routeImports.push('import { postsRouter } from "./routes/posts.js";');
      routeMounts.push('app.use("/api/posts", postsRouter);');
      break;
    case "landing":
      routeImports.push('import { contactRouter } from "./routes/contact.js";');
      routeMounts.push('app.use("/api/contact", contactRouter);');
      break;
    case "saas":
    case "crm":
      routeImports.push('import { dashboardRouter } from "./routes/dashboard.js";');
      routeMounts.push('app.use("/api/dashboard", dashboardRouter);');
      break;
    default:
      routeImports.push('import { healthRouter } from "./routes/health.js";');
      routeMounts.push('app.use("/api/health", healthRouter);');
  }

  const seedImport =
    appType === "ecommerce" || appType === "blog"
      ? 'import { runSeed } from "./seed/run.js";\n'
      : "";
  const seedCall =
    appType === "ecommerce" || appType === "blog"
      ? "  await runSeed();\n"
      : "";

  return [
    {
      path: "server/db.ts",
      content: `import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const url = process.env.DATABASE_URL ?? "./data/app.db";
mkdirSync(dirname(url), { recursive: true });

const sqlite = new Database(url);
export const db = drizzle(sqlite, { schema });
`,
    },
    {
      path: "server/middleware/auth.ts",
      content: auth
        ? `import type { Request, Response, NextFunction } from "express";
import { eq, and, gt } from "drizzle-orm";
import { db } from "../db.js";
import { sessions, users } from "../schema.js";

export type AuthedRequest = Request & { userId?: string; userEmail?: string };

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const sessionId = req.cookies?.session_id;
  if (!sessionId) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  const now = new Date().toISOString();
  const row = await db
    .select({ userId: sessions.userId, email: users.email })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, now)))
    .get();

  if (!row) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  req.userId = row.userId;
  req.userEmail = row.email;
  next();
}
`
        : `import type { Request, Response, NextFunction } from "express";

export type AuthedRequest = Request & { userId?: string };

export function requireAuth(_req: Request, res: Response, _next: NextFunction) {
  res.status(401).json({ error: "auth_not_configured" });
}
`,
    },
    {
      path: "server/index.ts",
      content: `${seedImport}import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
${routeImports.join("\n")}

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

${routeMounts.join("\n")}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "${blueprint.slug}" });
});

async function main() {
${seedCall}  app.listen(PORT, () => {
    console.log(\`API http://localhost:\${PORT}\`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
`,
    },
  ];
}
