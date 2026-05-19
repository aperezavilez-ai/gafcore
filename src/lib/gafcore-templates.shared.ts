/** Plantillas de proyecto GafCore (archivos iniciales del IDE). */

export type GafcoreTemplateFile = {
  name: string;
  language: string;
  content: string;
};

export type GafcoreProjectTemplateDef = {
  slug: string;
  name: string;
  description: string;
  category: "starter" | "landing" | "ecommerce";
  sort_order: number;
  files: GafcoreTemplateFile[];
};

export const GAFCORE_DEFAULT_TEMPLATE_SLUG = "blank-vite";

const STORE_LIB = `/** Persistencia local (FUNCTIONAL-FIRST). */
export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveJson<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}
`;

const MAIN_TSX = `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<App />);
`;

const STYLES = `:root { color-scheme: light; }
html, body, #root { height: 100%; margin: 0; }
body { font-family: ui-sans-serif, system-ui, sans-serif; }
`;

function indexHtml(title: string): GafcoreTemplateFile {
  return {
    name: "index.html",
    language: "html",
    content: `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${title}</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>`,
  };
}

export const GAFCORE_DEFAULT_TEMPLATE_FILES: GafcoreTemplateFile[] = [
  indexHtml("GafCore App"),
  {
    name: "main.tsx",
    language: "typescript",
    content: MAIN_TSX,
  },
  {
    name: "lib/store.ts",
    language: "typescript",
    content: STORE_LIB,
  },
  {
    name: "App.tsx",
    language: "typescript",
    content: `import React, { useEffect, useState } from "react";
import { loadJson, saveJson } from "./lib/store";

const STORAGE_KEY = "gafcore-demo-visits";

export default function App() {
  const [visits, setVisits] = useState(0);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setVisits(loadJson<number>(STORAGE_KEY, 0));
  }, []);

  const registerVisit = () => {
    const next = visits + 1;
    setVisits(next);
    saveJson(STORAGE_KEY, next);
    setStatus(\`Visita #\${next} guardada.\`);
  };

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-white">
      <section className="mx-auto max-w-3xl">
        <h1 className="text-4xl font-black">Proyecto listo</h1>
        <p className="mt-4 text-slate-300">Plantilla functional-first con estado y localStorage.</p>
        <p className="mt-2 text-sm text-slate-400">Visitas: {visits}</p>
        {status ? <p className="mt-2 text-sm text-emerald-400">{status}</p> : null}
        <button type="button" onClick={registerVisit} className="mt-8 rounded-lg bg-blue-600 px-5 py-2.5 font-semibold hover:bg-blue-500">
          Registrar visita
        </button>
      </section>
    </main>
  );
}
`,
  },
  { name: "styles.css", language: "css", content: STYLES },
];

const LANDING_APP = `import React, { useState } from "react";

const HERO = "https://picsum.photos/seed/gafcore-paint-hero-kitchen/1280/720";

export default function App() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSent(true);
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="text-lg font-bold tracking-tight">Mi marca</span>
        <a href="#contacto" className="rounded-full border border-white/30 px-4 py-2 text-sm hover:bg-white/10">Contacto</a>
      </header>
      <section className="mx-auto grid max-w-6xl gap-10 px-6 py-10 md:grid-cols-2 md:items-center">
        <motion.div>
          <p className="text-sm uppercase tracking-widest text-amber-400">Premium</p>
          <h1 className="mt-3 text-4xl font-black md:text-5xl">Tu landing en minutos</h1>
          <p className="mt-4 text-lg text-zinc-300">Hero, CTA y formulario funcional listos para iterar con IA.</p>
          <a href="#contacto" className="mt-8 inline-block rounded-lg bg-amber-500 px-6 py-3 font-semibold text-zinc-950 hover:bg-amber-400">Empezar</a>
        </motion.div>
        <img src={HERO} alt="Hero" width={640} height={360} className="w-full rounded-2xl object-cover shadow-2xl" />
      </section>
      <section id="contacto" className="border-t border-white/10 bg-zinc-900/50 py-16">
        <form onSubmit={onSubmit} className="mx-auto flex max-w-md flex-col gap-3 px-6">
          <h2 className="text-2xl font-bold">Solicita información</h2>
          <label className="text-sm text-zinc-400" htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-2" required />
          <button type="submit" className="rounded-lg bg-white px-4 py-2 font-semibold text-zinc-950">Enviar</button>
          {sent ? <p className="text-sm text-emerald-400">Gracias, te contactaremos pronto.</p> : null}
        </form>
      </section>
    </main>
  );
}
`.replace(/motion\./g, "");

const SHOP_APP = `import React, { useEffect, useState } from "react";
import { loadJson, saveJson } from "./lib/store";

type Product = { id: string; name: string; price: number; img: string };
const PRODUCTS: Product[] = [
  { id: "1", name: "Producto A", price: 29, img: "https://picsum.photos/seed/gafcore-paint-product-1/400/400" },
  { id: "2", name: "Producto B", price: 39, img: "https://picsum.photos/seed/gafcore-paint-product-2/400/400" },
  { id: "3", name: "Producto C", price: 49, img: "https://picsum.photos/seed/gafcore-paint-product-3/400/400" },
];
const CART_KEY = "gafcore-shop-cart";

export default function App() {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => setCart(loadJson(CART_KEY, {})), []);

  const add = (id: string) => {
    const next = { ...cart, [id]: (cart[id] ?? 0) + 1 };
    setCart(next);
    saveJson(CART_KEY, next);
    setMsg("Añadido al carrito");
  };

  const total = PRODUCTS.reduce((s, p) => s + (cart[p.id] ?? 0) * p.price, 0);
  const count = Object.values(cart).reduce((a, b) => a + b, 0);

  return (
    <main className="min-h-screen bg-stone-50 px-6 py-10 text-stone-900">
      <header className="mx-auto flex max-w-5xl items-center justify-between">
        <h1 className="text-2xl font-bold">Tienda demo</h1>
        <span className="text-sm">Carrito: {count} · {total} €</span>
      </header>
      {msg ? <p className="mx-auto mt-4 max-w-5xl text-sm text-emerald-700">{msg}</p> : null}
      <ul className="mx-auto mt-10 grid max-w-5xl gap-6 sm:grid-cols-3">
        {PRODUCTS.map((p) => (
          <li key={p.id} className="rounded-xl border bg-white p-4 shadow-sm">
            <img src={p.img} alt={p.name} width={320} height={320} className="aspect-square w-full rounded-lg object-cover" />
            <h2 className="mt-3 font-semibold">{p.name}</h2>
            <p className="text-stone-600">{p.price} €</p>
            <button type="button" onClick={() => add(p.id)} className="mt-3 w-full rounded-lg bg-stone-900 py-2 text-sm font-medium text-white hover:bg-stone-800">
              Añadir
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
`;

export const BUILTIN_PROJECT_TEMPLATES: GafcoreProjectTemplateDef[] = [
  {
    slug: GAFCORE_DEFAULT_TEMPLATE_SLUG,
    name: "Vite + React (blank)",
    description: "Contador con localStorage — base functional-first.",
    category: "starter",
    sort_order: 10,
    files: GAFCORE_DEFAULT_TEMPLATE_FILES,
  },
  {
    slug: "landing-premium",
    name: "Landing premium",
    description: "Hero con imagen, CTA y formulario de contacto.",
    category: "landing",
    sort_order: 20,
    files: [
      indexHtml("Landing"),
      { name: "main.tsx", language: "typescript", content: MAIN_TSX },
      { name: "lib/store.ts", language: "typescript", content: STORE_LIB },
      { name: "App.tsx", language: "typescript", content: LANDING_APP },
      { name: "styles.css", language: "css", content: STYLES },
    ],
  },
  {
    slug: "tienda-basica",
    name: "Tienda básica",
    description: "Catálogo, carrito y totales con persistencia local.",
    category: "ecommerce",
    sort_order: 30,
    files: [
      indexHtml("Tienda"),
      { name: "main.tsx", language: "typescript", content: MAIN_TSX },
      { name: "lib/store.ts", language: "typescript", content: STORE_LIB },
      { name: "App.tsx", language: "typescript", content: SHOP_APP },
      { name: "styles.css", language: "css", content: STYLES },
    ],
  },
];

/** Compatibilidad con CodeEditor / IDE. */
export const initialFiles = GAFCORE_DEFAULT_TEMPLATE_FILES;

export function validateTemplateFiles(files: unknown): GafcoreTemplateFile[] {
  if (!Array.isArray(files)) return [];
  const out: GafcoreTemplateFile[] = [];
  for (const row of files) {
    if (!row || typeof row !== "object") continue;
    const name = (row as GafcoreTemplateFile).name;
    const content = (row as GafcoreTemplateFile).content;
    const language = (row as GafcoreTemplateFile).language;
    if (typeof name !== "string" || typeof content !== "string") continue;
    if (name.includes("..") || name.length > 512) continue;
    out.push({
      name,
      content: content.slice(0, 500_000),
      language: typeof language === "string" ? language : "typescript",
    });
  }
  return out.length > 0 ? out : GAFCORE_DEFAULT_TEMPLATE_FILES;
}
