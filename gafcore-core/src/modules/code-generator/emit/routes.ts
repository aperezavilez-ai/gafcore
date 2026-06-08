import type { EmitContext, GeneratedFile } from "../types";

function emitAuthRoutes(): GeneratedFile {
  return {
    path: "server/routes/auth.ts",
    content: `import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { users, sessions } from "../schema.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!email || password.length < 6) {
    res.status(400).json({ error: "email_and_password_required" });
    return;
  }
  const existing = await db.select().from(users).where(eq(users.email, email)).get();
  if (existing) {
    res.status(409).json({ error: "email_taken" });
    return;
  }
  const id = randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);
  const createdAt = new Date().toISOString();
  await db.insert(users).values({ id, email, passwordHash, createdAt });
  res.status(201).json({ id, email });
});

authRouter.post("/login", async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  const user = await db.select().from(users).where(eq(users.email, email)).get();
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await db.insert(sessions).values({ id: sessionId, userId: user.id, expiresAt });
  res.cookie("session_id", sessionId, { httpOnly: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.json({ id: user.id, email: user.email });
});

authRouter.post("/logout", requireAuth, async (req: AuthedRequest, res) => {
  const sessionId = req.cookies?.session_id;
  if (sessionId) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
  }
  res.clearCookie("session_id");
  res.json({ ok: true });
});

authRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  res.json({ id: req.userId, email: req.userEmail });
});
`,
  };
}

function emitTodoRoutes(auth: boolean): GeneratedFile {
  const filter = auth
    ? `  const rows = await db.select().from(todos).where(eq(todos.userId, req.userId!)).all();`
    : `  const rows = await db.select().from(todos).all();`;
  const createUserId = auth ? `    userId: req.userId!,` : "";

  return {
    path: "server/routes/todos.ts",
    content: `import { Router } from "express";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { todos } from "../schema.js";
${auth ? 'import { requireAuth, type AuthedRequest } from "../middleware/auth.js";' : ""}

export const todosRouter = Router();
${auth ? "todosRouter.use(requireAuth);" : ""}

todosRouter.get("/", async (req${auth ? ": AuthedRequest" : ""}, res) => {
${filter}
  res.json(rows);
});

todosRouter.post("/", async (req${auth ? ": AuthedRequest" : ""}, res) => {
  const title = String(req.body?.title ?? "").trim();
  if (!title) {
    res.status(400).json({ error: "title_required" });
    return;
  }
  const row = {
    id: randomUUID(),
${createUserId}
    title,
    completed: false,
    createdAt: new Date().toISOString(),
  };
  await db.insert(todos).values(row);
  res.status(201).json(row);
});

todosRouter.patch("/:id", async (req${auth ? ": AuthedRequest" : ""}, res) => {
  const id = req.params.id;
  const updates: Record<string, unknown> = {};
  if (typeof req.body?.title === "string") updates.title = req.body.title.trim();
  if (typeof req.body?.completed === "boolean") updates.completed = req.body.completed;
  await db.update(todos).set(updates).where(eq(todos.id, id));
  const row = await db.select().from(todos).where(eq(todos.id, id)).get();
  res.json(row);
});

todosRouter.delete("/:id", async (req, res) => {
  await db.delete(todos).where(eq(todos.id, req.params.id));
  res.json({ ok: true });
});
`,
  };
}

function emitProductsRoutes(): GeneratedFile {
  return {
    path: "server/routes/products.ts",
    content: `import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db.js";
import { products } from "../schema.js";

export const productsRouter = Router();

productsRouter.get("/", async (_req, res) => {
  const rows = await db.select().from(products).all();
  res.json(rows);
});

productsRouter.get("/:id", async (req, res) => {
  const row = await db.select().from(products).where(eq(products.id, req.params.id)).get();
  if (!row) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(row);
});
`,
  };
}

function emitCartRoutes(auth: boolean): GeneratedFile {
  const ownerFilter = auth
    ? `eq(cartItems.userId, req.userId!)`
    : `eq(cartItems.sessionId, req.cookies?.cart_session ?? "")`;

  return {
    path: "server/routes/cart.ts",
    content: `import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { cartItems, products } from "../schema.js";
${auth ? 'import { requireAuth, type AuthedRequest } from "../middleware/auth.js";' : ""}

export const cartRouter = Router();
${auth ? "cartRouter.use(requireAuth);" : ""}

function ensureCartSession(req: AuthedRequest, res: import("express").Response) {
  if (!req.cookies?.cart_session) {
    const id = randomUUID();
    res.cookie("cart_session", id, { httpOnly: true, sameSite: "lax", maxAge: 30 * 24 * 60 * 60 * 1000 });
    return id;
  }
  return req.cookies.cart_session as string;
}

cartRouter.get("/", async (req${auth ? ": AuthedRequest" : ""}, res) => {
  ${auth ? "" : "const sid = ensureCartSession(req as AuthedRequest, res);"}
  const rows = await db
    .select({
      id: cartItems.id,
      productId: cartItems.productId,
      quantity: cartItems.quantity,
      name: products.name,
      price: products.price,
    })
    .from(cartItems)
    .innerJoin(products, eq(products.id, cartItems.productId))
    .where(${auth ? ownerFilter : "eq(cartItems.sessionId, sid)"})
    .all();
  const total = rows.reduce((sum, r) => sum + r.price * r.quantity, 0);
  res.json({ items: rows, total });
});

cartRouter.post("/items", async (req${auth ? ": AuthedRequest" : ""}, res) => {
  const productId = String(req.body?.productId ?? "");
  const quantity = Number(req.body?.quantity ?? 1);
  if (!productId || quantity < 1) {
    res.status(400).json({ error: "invalid_item" });
    return;
  }
  ${auth ? "" : "const sid = ensureCartSession(req as AuthedRequest, res);"}
  const row = {
    id: randomUUID(),
    productId,
    quantity,
    ${auth ? "userId: req.userId!," : "sessionId: sid,"}
  };
  await db.insert(cartItems).values(row);
  res.status(201).json(row);
});

cartRouter.patch("/items/:id", async (req, res) => {
  const quantity = Number(req.body?.quantity ?? 1);
  await db.update(cartItems).set({ quantity }).where(eq(cartItems.id, req.params.id));
  res.json({ ok: true });
});

cartRouter.delete("/items/:id", async (req, res) => {
  await db.delete(cartItems).where(eq(cartItems.id, req.params.id));
  res.json({ ok: true });
});
`,
  };
}

function emitPostsRoutes(auth: boolean): GeneratedFile {
  return {
    path: "server/routes/posts.ts",
    content: `import { Router } from "express";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { posts } from "../schema.js";
${auth ? 'import { requireAuth, type AuthedRequest } from "../middleware/auth.js";' : ""}

export const postsRouter = Router();

postsRouter.get("/", async (_req, res) => {
  const rows = await db.select().from(posts).all();
  res.json(rows);
});

postsRouter.get("/:id", async (req, res) => {
  const row = await db.select().from(posts).where(eq(posts.id, req.params.id)).get();
  if (!row) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(row);
});

${auth ? `postsRouter.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const title = String(req.body?.title ?? "").trim();
  const body = String(req.body?.body ?? "").trim();
  if (!title || !body) {
    res.status(400).json({ error: "title_and_body_required" });
    return;
  }
  const row = {
    id: randomUUID(),
    title,
    body,
    publishedAt: new Date().toISOString(),
    authorId: req.userId!,
  };
  await db.insert(posts).values(row);
  res.status(201).json(row);
});` : ""}
`,
  };
}

function emitContactRoutes(): GeneratedFile {
  return {
    path: "server/routes/contact.ts",
    content: `import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { contactSubmissions } from "../schema.js";

export const contactRouter = Router();

contactRouter.post("/", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const email = String(req.body?.email ?? "").trim();
  const message = String(req.body?.message ?? "").trim();
  if (!name || !email || !message) {
    res.status(400).json({ error: "all_fields_required" });
    return;
  }
  const row = {
    id: randomUUID(),
    name,
    email,
    message,
    createdAt: new Date().toISOString(),
  };
  await db.insert(contactSubmissions).values(row);
  res.status(201).json({ ok: true });
});
`,
  };
}

function emitDashboardRoutes(): GeneratedFile {
  return {
    path: "server/routes/dashboard.ts",
    content: `import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get("/", async (req: AuthedRequest, res) => {
  res.json({
    userId: req.userId,
    email: req.userEmail,
    stats: { active: true, generatedAt: new Date().toISOString() },
  });
});
`,
  };
}

function emitHealthRoutes(): GeneratedFile {
  return {
    path: "server/routes/health.ts",
    content: `import { Router } from "express";
export const healthRouter = Router();
healthRouter.get("/", (_req, res) => res.json({ ok: true }));
`,
  };
}

function emitSeed(ctx: EmitContext): GeneratedFile[] {
  const { blueprint } = ctx;
  if (blueprint.parsed.appType === "ecommerce") {
    return [
      {
        path: "server/seed/products.ts",
        content: `import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { products } from "../schema.js";

export async function seedProducts() {
  const existing = await db.select().from(products).all();
  if (existing.length > 0) return;
  const items = [
    { name: "Zapato Runner Pro", price: 89.99, stock: 12 },
    { name: "Zapato Urban Classic", price: 74.5, stock: 8 },
    { name: "Zapato Trail Max", price: 99.0, stock: 5 },
  ];
  for (const p of items) {
    await db.insert(products).values({
      id: randomUUID(),
      name: p.name,
      price: p.price,
      imageUrl: "",
      stock: p.stock,
    });
  }
}
`,
      },
      {
        path: "server/seed/run.ts",
        content: `import { seedProducts } from "./products.js";

export async function runSeed() {
  await seedProducts();
  console.log("Seed OK");
}
`,
      },
    ];
  }
  if (blueprint.parsed.appType === "blog") {
    return [
      {
        path: "server/seed/posts.ts",
        content: `import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { posts } from "../schema.js";

export async function seedPosts() {
  const existing = await db.select().from(posts).all();
  if (existing.length > 0) return;
  await db.insert(posts).values({
    id: randomUUID(),
    title: "Bienvenido al blog",
    body: "Primer artículo generado por GafCore.",
    publishedAt: new Date().toISOString(),
  });
}
`,
      },
      {
        path: "server/seed/run.ts",
        content: `import { seedPosts } from "./posts.js";

export async function runSeed() {
  await seedPosts();
  console.log("Seed OK");
}
`,
      },
    ];
  }
  return [];
}

export function emitRoutes(ctx: EmitContext): GeneratedFile[] {
  const { blueprint } = ctx;
  const files: GeneratedFile[] = [];
  const auth = blueprint.parsed.auth.required;
  const appType = blueprint.parsed.appType;
  const hasCart = blueprint.parsed.features.some((f) => f.id === "cart");

  if (auth) files.push(emitAuthRoutes());

  switch (appType) {
    case "todo":
      files.push(emitTodoRoutes(auth));
      break;
    case "ecommerce":
      files.push(emitProductsRoutes());
      if (hasCart) files.push(emitCartRoutes(auth));
      files.push(...emitSeed(ctx));
      break;
    case "blog":
      files.push(emitPostsRoutes(auth));
      files.push(...emitSeed(ctx));
      break;
    case "landing":
      files.push(emitContactRoutes());
      break;
    case "saas":
    case "crm":
      files.push(emitDashboardRoutes());
      break;
    default:
      files.push(emitHealthRoutes());
  }

  return files;
}
