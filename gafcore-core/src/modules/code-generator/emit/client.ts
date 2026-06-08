import type { EmitContext, GeneratedFile } from "../types";

export function emitClient(ctx: EmitContext): GeneratedFile[] {
  const { blueprint } = ctx;
  const title = blueprint.parsed.title;
  const auth = blueprint.parsed.auth.required;
  const appType = blueprint.parsed.appType;
  const hasCart = blueprint.parsed.features.some((f) => f.id === "cart");

  const files: GeneratedFile[] = [
    {
      path: "client/src/main.tsx",
      content: `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`,
    },
    {
      path: "client/src/api/client.ts",
      content: `export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? \`HTTP \${res.status}\`);
  }
  return res.json() as Promise<T>;
}
`,
    },
    {
      path: "client/src/styles.css",
      content: `:root {
  font-family: system-ui, sans-serif;
  color: #0f172a;
  background: #f8fafc;
}
* { box-sizing: border-box; }
body { margin: 0; }
a { color: #2563eb; }
button, input { font: inherit; }
.app-shell { max-width: 960px; margin: 0 auto; padding: 1.5rem; }
.nav { display: flex; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
.nav a, .nav button { cursor: pointer; background: none; border: none; color: #2563eb; text-decoration: underline; }
.card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem; }
.btn { background: #2563eb; color: #fff; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; }
.btn:disabled { opacity: 0.6; cursor: not-allowed; }
input { padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 6px; width: 100%; max-width: 320px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; }
.error { color: #dc2626; font-size: 0.875rem; }
`,
    },
  ];

  if (auth) {
    files.push(
      {
        path: "client/src/hooks/useAuth.ts",
        content: `import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";

type User = { id: string; email: string };

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api<User>("/api/auth/me");
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const login = async (email: string, password: string) => {
    const u = await api<User>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setUser(u);
    return u;
  };

  const register = async (email: string, password: string) => {
    await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    return login(email, password);
  };

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
  };

  return { user, loading, login, register, logout, refresh };
}
`,
      },
      {
        path: "client/src/pages/LoginPage.tsx",
        content: `import { useState } from "react";

type Props = { onLogin: (email: string, password: string) => Promise<void>; onGoRegister: () => void };

export function LoginPage({ onLogin, onGoRegister }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onLogin(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h1>Iniciar sesión</h1>
      <form onSubmit={submit}>
        <p><input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required /></p>
        <p><input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required /></p>
        {error && <p className="error">{error}</p>}
        <button className="btn" type="submit" disabled={busy}>Entrar</button>
      </form>
      <p><button type="button" onClick={onGoRegister}>Crear cuenta</button></p>
    </div>
  );
}
`,
      },
      {
        path: "client/src/pages/RegisterPage.tsx",
        content: `import { useState } from "react";

type Props = { onRegister: (email: string, password: string) => Promise<void>; onGoLogin: () => void };

export function RegisterPage({ onRegister, onGoLogin }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onRegister(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h1>Crear cuenta</h1>
      <form onSubmit={submit}>
        <p><input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required /></p>
        <p><input type="password" placeholder="Contraseña (mín. 6)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></p>
        {error && <p className="error">{error}</p>}
        <button className="btn" type="submit" disabled={busy}>Registrarse</button>
      </form>
      <p><button type="button" onClick={onGoLogin}>Ya tengo cuenta</button></p>
    </div>
  );
}
`,
      },
    );
  }

  // App.tsx
  const navLinks: string[] = [];
  const pageImports: string[] = [];
  const pageCases: string[] = [];

  if (auth) {
    pageImports.push('import { LoginPage } from "./pages/LoginPage";');
    pageImports.push('import { RegisterPage } from "./pages/RegisterPage";');
    pageImports.push('import { useAuth } from "./hooks/useAuth";');
    pageCases.push(`    if (path === "/login") return <LoginPage onLogin={login} onGoRegister={() => setPath("/register")} />;`);
    pageCases.push(`    if (path === "/register") return <RegisterPage onRegister={register} onGoLogin={() => setPath("/login")} />;`);
    navLinks.push(`{user && <button type="button" onClick={() => void logout()}>Salir</button>}`);
  }

  switch (appType) {
    case "todo":
      pageImports.push('import { TodosPage } from "./pages/TodosPage";');
      pageCases.push(`    if (path === "/") return <TodosPage />;`);
      navLinks.unshift(`<button type="button" onClick={() => setPath("/")}>Tareas</button>`);
      files.push({ path: "client/src/pages/TodosPage.tsx", content: emitTodosPage() });
      break;
    case "ecommerce":
      pageImports.push('import { CatalogPage } from "./pages/CatalogPage";');
      pageCases.push(`    if (path === "/") return <CatalogPage onGoCart={() => setPath("/cart")} />;`);
      navLinks.unshift(`<button type="button" onClick={() => setPath("/")}>Catálogo</button>`);
      files.push({ path: "client/src/pages/CatalogPage.tsx", content: emitCatalogPage(hasCart) });
      if (hasCart) {
        pageImports.push('import { CartPage } from "./pages/CartPage";');
        pageCases.push(`    if (path === "/cart") return <CartPage />;`);
        navLinks.push(`<button type="button" onClick={() => setPath("/cart")}>Carrito</button>`);
        files.push({ path: "client/src/pages/CartPage.tsx", content: emitCartPage() });
      }
      break;
    case "blog":
      pageImports.push('import { HomePage } from "./pages/HomePage";');
      pageCases.push(`    if (path === "/") return <HomePage />;`);
      navLinks.unshift(`<button type="button" onClick={() => setPath("/")}>Blog</button>`);
      files.push({ path: "client/src/pages/HomePage.tsx", content: emitBlogHomePage() });
      break;
    case "landing":
      pageImports.push('import { LandingPage } from "./pages/LandingPage";');
      pageCases.push(`    if (path === "/") return <LandingPage />;`);
      files.push({ path: "client/src/pages/LandingPage.tsx", content: emitLandingPage(title) });
      break;
    case "saas":
    case "crm":
      pageImports.push('import { DashboardPage } from "./pages/DashboardPage";');
      pageCases.push(`    if (path === "/") return <DashboardPage />;`);
      navLinks.unshift(`<button type="button" onClick={() => setPath("/")}>Dashboard</button>`);
      files.push({ path: "client/src/pages/DashboardPage.tsx", content: emitDashboardPage() });
      break;
    default:
      pageCases.push(`    if (path === "/") return <div className="card"><h1>${title}</h1><p>App generada por GafCore</p></div>;`);
  }

  const authGuard = auth
    ? `
  const { user, loading, login, register, logout } = useAuth();
  const protectedPaths = ${JSON.stringify(blueprint.frontendRoutes.filter((r) => r.requiresAuth).map((r) => r.path))};
  useEffect(() => {
    if (!loading && protectedPaths.includes(path) && !user && path !== "/login" && path !== "/register") {
      setPath("/login");
    }
  }, [loading, path, user]);
  if (loading) return <div className="app-shell">Cargando…</div>;
`
    : "";

  files.push({
    path: "client/src/App.tsx",
    content: `import { useEffect, useState } from "react";
${pageImports.join("\n")}

export default function App() {
  const [path, setPath] = useState("/");
${auth ? authGuard : ""}

  const render = () => {
${pageCases.join("\n")}
    return <div className="card">Página no encontrada</div>;
  };

  return (
    <div className="app-shell">
      <header>
        <h1>${title}</h1>
        <nav className="nav">
          ${navLinks.join("\n          ")}
        </nav>
      </header>
      <main>{render()}</main>
    </div>
  );
}
`,
  });

  return files;
}

function emitTodosPage(): string {
  return `import { useEffect, useState } from "react";
import { api } from "../api/client";

type Todo = { id: string; title: string; completed: boolean };

export function TodosPage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setTodos(await api<Todo[]>("/api/todos"));
  };

  useEffect(() => { void load(); }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api("/api/todos", { method: "POST", body: JSON.stringify({ title }) });
      setTitle("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  };

  const toggle = async (t: Todo) => {
    await api(\`/api/todos/\${t.id}\`, { method: "PATCH", body: JSON.stringify({ completed: !t.completed }) });
    await load();
  };

  const remove = async (id: string) => {
    await api(\`/api/todos/\${id}\`, { method: "DELETE" });
    await load();
  };

  return (
    <div>
      <form onSubmit={add}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nueva tarea" required />
        <button className="btn" type="submit">Añadir</button>
      </form>
      {error && <p className="error">{error}</p>}
      <ul>
        {todos.map((t) => (
          <li key={t.id} className="card">
            <label>
              <input type="checkbox" checked={t.completed} onChange={() => void toggle(t)} />
              {t.title}
            </label>
            <button type="button" onClick={() => void remove(t.id)}>Eliminar</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
`;
}

function emitCatalogPage(hasCart: boolean): string {
  const cartBtn = hasCart
    ? `<button className="btn" type="button" onClick={() => void addToCart(p.id)}>Añadir al carrito</button>`
    : "";
  const cartLogic = hasCart
    ? `
  const addToCart = async (productId: string) => {
    await api("/api/cart/items", { method: "POST", body: JSON.stringify({ productId, quantity: 1 }) });
    onGoCart();
  };`
    : "";

  return `import { useEffect, useState } from "react";
import { api } from "../api/client";

type Product = { id: string; name: string; price: number; stock: number };

type Props = { onGoCart: () => void };

export function CatalogPage({ onGoCart }: Props) {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    void api<Product[]>("/api/products").then(setProducts);
  }, []);
${cartLogic}

  return (
    <div>
      <div className="grid">
        {products.map((p) => (
          <div key={p.id} className="card">
            <h3>{p.name}</h3>
            <p>{p.price.toFixed(2)} € · Stock: {p.stock}</p>
            ${cartBtn}
          </div>
        ))}
      </div>
    </div>
  );
}
`;
}

function emitCartPage(): string {
  return `import { useEffect, useState } from "react";
import { api } from "../api/client";

type CartItem = { id: string; name: string; price: number; quantity: number };
type Cart = { items: CartItem[]; total: number };

export function CartPage() {
  const [cart, setCart] = useState<Cart>({ items: [], total: 0 });

  const load = async () => {
    setCart(await api<Cart>("/api/cart"));
  };

  useEffect(() => { void load(); }, []);

  const remove = async (id: string) => {
    await api(\`/api/cart/items/\${id}\`, { method: "DELETE" });
    await load();
  };

  return (
    <div>
      <h2>Carrito</h2>
      {cart.items.map((i) => (
        <div key={i.id} className="card">
          <span>{i.name} × {i.quantity} — {(i.price * i.quantity).toFixed(2)} €</span>
          <button type="button" onClick={() => void remove(i.id)}>Quitar</button>
        </div>
      ))}
      <p><strong>Total: {cart.total.toFixed(2)} €</strong></p>
    </div>
  );
}
`;
}

function emitBlogHomePage(): string {
  return `import { useEffect, useState } from "react";
import { api } from "../api/client";

type Post = { id: string; title: string; body: string; publishedAt: string };

export function HomePage() {
  const [posts, setPosts] = useState<Post[]>([]);
  useEffect(() => { void api<Post[]>("/api/posts").then(setPosts); }, []);
  return (
    <div>
      {posts.map((p) => (
        <article key={p.id} className="card">
          <h2>{p.title}</h2>
          <p>{p.body}</p>
          <small>{new Date(p.publishedAt).toLocaleString()}</small>
        </article>
      ))}
    </div>
  );
}
`;
}

function emitLandingPage(title: string): string {
  return `import { useState } from "react";
import { api } from "../api/client";

export function LandingPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api("/api/contact", { method: "POST", body: JSON.stringify({ name, email, message }) });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    }
  };

  return (
    <div className="card">
      <h1>${title}</h1>
      <p>Formulario conectado al backend (guarda en SQLite).</p>
      {sent ? (
        <p>¡Mensaje enviado!</p>
      ) : (
        <form onSubmit={submit}>
          <p><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" required /></p>
          <p><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required /></p>
          <p><textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Mensaje" required rows={4} style={{ width: "100%", maxWidth: 400 }} /></p>
          {error && <p className="error">{error}</p>}
          <button className="btn" type="submit">Enviar</button>
        </form>
      )}
    </div>
  );
}
`;
}

function emitDashboardPage(): string {
  return `import { useEffect, useState } from "react";
import { api } from "../api/client";

type Dashboard = { userId: string; email: string; stats: { active: boolean; generatedAt: string } };

export function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  useEffect(() => { void api<Dashboard>("/api/dashboard").then(setData); }, []);
  if (!data) return <p>Cargando…</p>;
  return (
    <div className="card">
      <h2>Dashboard</h2>
      <p>Usuario: {data.email}</p>
      <p>Activo: {data.stats.active ? "Sí" : "No"}</p>
    </div>
  );
}
`;
}
