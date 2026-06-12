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
  category: "starter" | "landing" | "ecommerce" | "mobile" | "dashboard" | "blog" | "portfolio";
  sort_order: number;
  files: GafcoreTemplateFile[];
};

export const GAFCORE_DEFAULT_TEMPLATE_SLUG = "blank-vite";

/** Plantilla canónica lib/store.ts — sin genéricos <T> (rompen parsers JSX/heal). */
export const GAFCORE_LIB_STORE_TS = `/** Persistencia local (FUNCTIONAL-FIRST). */
export function loadJson(key: string, fallback: unknown): unknown {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}
`;

const STORE_LIB = GAFCORE_LIB_STORE_TS;

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

function indexHtml(title: string, opts?: { mobile?: boolean }): GafcoreTemplateFile {
  const mobileMeta = opts?.mobile
    ? `
    <meta name="theme-color" content="#0f172a" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />`
    : "";
  return {
    name: "index.html",
    language: "html",
    content: `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />${mobileMeta}
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

const MOBILE_STYLES = `:root { color-scheme: dark; }
html, body, #root { height: 100%; margin: 0; }
body {
  font-family: ui-sans-serif, system-ui, sans-serif;
  background: #0f172a;
  -webkit-tap-highlight-color: transparent;
}
`;

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
    content: `import React from "react";

const LOGO_URL = "https://gafcore.com/gafcore-logo.png";

export default function App() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-violet-950 to-slate-900 px-6 py-16 text-white">
      <section className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <img
          src={LOGO_URL}
          alt="GafCore — Tu idea + IA = Realidad"
          className="mb-8 h-44 w-auto max-w-full object-contain sm:h-52"
        />
        <p className="max-w-2xl text-lg text-slate-300 sm:text-xl">
          Diseña, construye y publica tu sitio web o app describiéndolo en lenguaje natural.
          La IA escribe el código, tú diriges la visión.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3 text-sm">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-slate-300">
            Diseño profesional
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-slate-300">
            Build automático
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-slate-300">
            Deploy en 1 clic
          </span>
        </div>
        <p className="mt-12 text-sm text-slate-400">
          Empieza escribiendo en el chat lo que quieres construir.
        </p>
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
  const [section, setSection] = useState<"inicio" | "contacto">("inicio");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSent(true);
  };

  const goContacto = () => {
    setSection("contacto");
    document.getElementById("contacto")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="text-lg font-bold tracking-tight">Mi marca</span>
        <nav className="flex gap-2">
          <button type="button" onClick={() => setSection("inicio")} className="rounded-full border border-white/30 px-4 py-2 text-sm hover:bg-white/10">Inicio</button>
          <button type="button" onClick={goContacto} className="rounded-full border border-white/30 px-4 py-2 text-sm hover:bg-white/10">Contacto</button>
        </nav>
      </header>
      {section === "inicio" ? (
      <section id="inicio" className="mx-auto grid max-w-6xl gap-10 px-6 py-10 md:grid-cols-2 md:items-center">
        <div>
          <p className="text-sm uppercase tracking-widest text-amber-400">Premium</p>
          <h1 className="mt-3 text-4xl font-black md:text-5xl">Tu landing en minutos</h1>
          <p className="mt-4 text-lg text-zinc-300">Hero, CTA y formulario funcional listos para iterar con IA.</p>
          <button type="button" onClick={goContacto} className="mt-8 rounded-lg bg-amber-500 px-6 py-3 font-semibold text-zinc-950 hover:bg-amber-400">Empezar</button>
        </div>
        <img src={HERO} alt="Hero" width={640} height={360} className="w-full rounded-2xl object-cover shadow-2xl" />
      </section>
      ) : null}
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

const MOBILE_APP = `import React, { useState } from "react";
import { loadJson, saveJson } from "./lib/store";

type Tab = "inicio" | "explorar" | "perfil";
const FAV_KEY = "gafcore-mobile-favs";

const FEED = [
  { id: "1", title: "Descubre funciones", body: "Diseño mobile-first listo para PWA y pantallas táctiles." },
  { id: "2", title: "Itera con IA", body: "Pide en el chat: login, notificaciones o mapa." },
  { id: "3", title: "Publica", body: "Despliega tu app web instalable desde GafCore." },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("inicio");
  const [favs, setFavs] = useState<string[]>(() => loadJson(FAV_KEY, [] as string[]));

  const toggleFav = (id: string) => {
    const next = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id];
    setFavs(next);
    saveJson(FAV_KEY, next);
  };

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col bg-slate-950 text-white">
      <header className="safe-top border-b border-white/10 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="text-xs uppercase tracking-widest text-sky-400">App móvil</p>
        <h1 className="text-xl font-bold">Mi app</h1>
      </header>
      <main className="flex-1 overflow-y-auto px-4 py-4 pb-24">
        {tab === "inicio" && (
          <ul className="space-y-3">
            {FEED.map((item) => (
              <li key={item.id} className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
                <h2 className="font-semibold">{item.title}</h2>
                <p className="mt-1 text-sm text-slate-400">{item.body}</p>
                <button type="button" onClick={() => toggleFav(item.id)} className="mt-3 text-sm text-sky-400">
                  {favs.includes(item.id) ? "★ Guardado" : "☆ Guardar"}
                </button>
              </li>
            ))}
          </ul>
        )}
        {tab === "explorar" && (
          <div className="grid grid-cols-2 gap-3">
            {["Chat", "Mapa", "Cámara", "Pagos"].map((label) => (
              <button key={label} type="button" className="rounded-2xl bg-slate-800 py-8 text-sm font-medium active:scale-95">
                {label}
              </button>
            ))}
          </div>
        )}
        {tab === "perfil" && (
          <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-4">
            <p className="text-sm text-slate-400">Usuario demo</p>
            <p className="mt-1 font-semibold">@tu_cuenta</p>
            <p className="mt-4 text-sm text-slate-400">Favoritos: {favs.length}</p>
          </section>
        )}
      </main>
      <nav className="safe-bottom fixed bottom-0 left-0 right-0 mx-auto max-w-md border-t border-white/10 bg-slate-950/95 backdrop-blur">
        <div className="grid grid-cols-3 gap-1 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
          {(["inicio", "explorar", "perfil"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={\`rounded-xl py-2.5 text-sm font-medium capitalize \${
                tab === t ? "bg-sky-600 text-white" : "text-slate-400"
              }\`}
            >
              {t}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
`;

const DASHBOARD_APP = `import React, { useState } from "react";

const METRICS = [
  { label: "Usuarios", value: "1.2k", delta: "+8%" },
  { label: "Ingresos", value: "4.8k €", delta: "+12%" },
  { label: "Conversión", value: "3.4%", delta: "-0.2%" },
];

export default function App() {
  const [range, setRange] = useState<"7d" | "30d">("7d");

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 md:px-8">
      <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Panel de control</h1>
          <p className="text-sm text-slate-600">Métricas y acciones rápidas</p>
        </div>
        <div className="flex rounded-lg border bg-white p-1 text-sm">
          {(["7d", "30d"] as const).map((r) => (
            <button key={r} type="button" onClick={() => setRange(r)} className={\`rounded-md px-3 py-1.5 \${range === r ? "bg-slate-900 text-white" : ""}\`}>
              {r}
            </button>
          ))}
        </div>
      </header>
      <section className="mx-auto mt-8 grid max-w-5xl gap-4 sm:grid-cols-3">
        {METRICS.map((m) => (
          <article key={m.label} className="rounded-xl border bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{m.label}</p>
            <p className="mt-2 text-2xl font-bold">{m.value}</p>
            <p className="mt-1 text-sm text-emerald-600">{m.delta}</p>
          </article>
        ))}
      </section>
      <section className="mx-auto mt-8 max-w-5xl rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="font-semibold">Actividad reciente</h2>
        <ul className="mt-4 space-y-2 text-sm text-slate-600">
          <li>Nuevo registro — hace 2 h</li>
          <li>Pago completado — hace 5 h</li>
          <li>Informe exportado — ayer</li>
        </ul>
      </section>
    </main>
  );
}
`;

const BLOG_APP = `import React, { useState } from "react";

const POSTS = [
  { id: "1", title: "Primer artículo", excerpt: "Introduce tu blog y comparte actualizaciones.", date: "19 may 2026" },
  { id: "2", title: "Guía rápida", excerpt: "Cómo publicar y optimizar SEO con GafCore.", date: "12 may 2026" },
];

export default function App() {
  const [active, setActive] = useState<string | null>(null);
  const post = POSTS.find((p) => p.id === active);

  if (post) {
    return (
      <article className="min-h-screen bg-white px-6 py-12 text-stone-900">
        <button type="button" onClick={() => setActive(null)} className="text-sm text-blue-600">← Volver</button>
        <time className="mt-4 block text-sm text-stone-500">{post.date}</time>
        <h1 className="mt-2 text-3xl font-bold">{post.title}</h1>
        <p className="mt-6 leading-relaxed text-stone-700">{post.excerpt} Amplía este contenido con el editor IA.</p>
      </article>
    );
  }

  return (
    <main className="min-h-screen bg-stone-50 px-6 py-12">
      <h1 className="text-3xl font-bold text-stone-900">Mi blog</h1>
      <p className="mt-2 text-stone-600">Artículos y noticias</p>
      <ul className="mx-auto mt-10 max-w-2xl space-y-4">
        {POSTS.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => setActive(p.id)} className="w-full rounded-xl border bg-white p-5 text-left shadow-sm hover:border-stone-300">
              <time className="text-xs text-stone-500">{p.date}</time>
              <h2 className="mt-1 text-lg font-semibold">{p.title}</h2>
              <p className="mt-2 text-sm text-stone-600">{p.excerpt}</p>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
`;

const PORTFOLIO_APP = `import React, { useState } from "react";

const WORKS = [
  { id: "1", title: "Proyecto Alpha", tag: "Web", img: "https://picsum.photos/seed/gafcore-portfolio-1/600/400" },
  { id: "2", title: "Proyecto Beta", tag: "App", img: "https://picsum.photos/seed/gafcore-portfolio-2/600/400" },
  { id: "3", title: "Proyecto Gamma", tag: "Branding", img: "https://picsum.photos/seed/gafcore-portfolio-3/600/400" },
];

export default function App() {
  const [filter, setFilter] = useState<string>("Todos");
  const tags = ["Todos", ...new Set(WORKS.map((w) => w.tag))];
  const shown = filter === "Todos" ? WORKS : WORKS.filter((w) => w.tag === filter);

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-16 text-white">
      <section className="mx-auto max-w-4xl text-center">
        <p className="text-sm uppercase tracking-widest text-violet-400">Portfolio</p>
        <h1 className="mt-2 text-4xl font-black">Tu nombre</h1>
        <p className="mt-3 text-zinc-400">Diseño · Desarrollo · Producto</p>
      </section>
      <div className="mx-auto mt-10 flex max-w-4xl flex-wrap justify-center gap-2">
        {tags.map((t) => (
          <button key={t} type="button" onClick={() => setFilter(t)} className={\`rounded-full px-4 py-1.5 text-sm \${filter === t ? "bg-violet-600" : "border border-white/20"}\`}>
            {t}
          </button>
        ))}
      </div>
      <ul className="mx-auto mt-10 grid max-w-4xl gap-6 sm:grid-cols-2">
        {shown.map((w) => (
          <li key={w.id} className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900">
            <img src={w.img} alt={w.title} width={600} height={400} className="aspect-[3/2] w-full object-cover" />
            <div className="p-4">
              <span className="text-xs text-violet-300">{w.tag}</span>
              <h2 className="mt-1 font-semibold">{w.title}</h2>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
`;

const SHOP_APP = `import React, { useEffect, useState } from "react";
import { loadJson, saveJson } from "./lib/store";

type Product = { id: string; name: string; price: number; img: string };
const PRODUCTS: Product[] = [
  { id: "1", name: "Producto A", price: 29, img: "https://picsum.photos/seed/gafcore-paint-product-1/400/400" },
  { id: "2", name: "Producto B", price: 39, img: "https://picsum.photos/seed/gafcore-paint-product-2/400/400" },
  { id: "3", name: "Producto C", price: 49, img: "https://picsum.photos/seed/gafcore-paint-product-3/400/400" },
];
const CART_KEY = "gafcore-shop-cart";
const MONEY_CFG = (() => {
  const locale =
    typeof navigator !== "undefined" && navigator.language
      ? navigator.language
      : "en-US";
  const currency = /^es-MX/i.test(locale) ? "MXN" : "USD";
  return { locale, currency };
})();

function money(value: number): string {
  return new Intl.NumberFormat(MONEY_CFG.locale, {
    style: "currency",
    currency: MONEY_CFG.currency,
    maximumFractionDigits: 0,
  }).format(value);
}

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
        <span className="text-sm">Carrito: {count} · {money(total)}</span>
      </header>
      {msg ? <p className="mx-auto mt-4 max-w-5xl text-sm text-emerald-700">{msg}</p> : null}
      <ul className="mx-auto mt-10 grid max-w-5xl gap-6 sm:grid-cols-3">
        {PRODUCTS.map((p) => (
          <li key={p.id} className="rounded-xl border bg-white p-4 shadow-sm">
            <img src={p.img} alt={p.name} width={320} height={320} className="aspect-square w-full rounded-lg object-cover" />
            <h2 className="mt-3 font-semibold">{p.name}</h2>
            <p className="text-stone-600">{money(p.price)}</p>
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
  {
    slug: "app-movil",
    name: "App móvil (PWA)",
    description: "Navegación inferior, pantallas táctiles y diseño mobile-first instalable.",
    category: "mobile",
    sort_order: 40,
    files: [
      indexHtml("Mi app móvil", { mobile: true }),
      { name: "main.tsx", language: "typescript", content: MAIN_TSX },
      { name: "lib/store.ts", language: "typescript", content: STORE_LIB },
      { name: "App.tsx", language: "typescript", content: MOBILE_APP },
      { name: "styles.css", language: "css", content: MOBILE_STYLES },
    ],
  },
  {
    slug: "panel-dashboard",
    name: "Panel / dashboard",
    description: "Métricas, tarjetas KPI y actividad reciente.",
    category: "dashboard",
    sort_order: 50,
    files: [
      indexHtml("Dashboard"),
      { name: "main.tsx", language: "typescript", content: MAIN_TSX },
      { name: "lib/store.ts", language: "typescript", content: STORE_LIB },
      { name: "App.tsx", language: "typescript", content: DASHBOARD_APP },
      { name: "styles.css", language: "css", content: STYLES },
    ],
  },
  {
    slug: "blog",
    name: "Blog",
    description: "Listado de artículos y vista de detalle.",
    category: "blog",
    sort_order: 60,
    files: [
      indexHtml("Blog"),
      { name: "main.tsx", language: "typescript", content: MAIN_TSX },
      { name: "lib/store.ts", language: "typescript", content: STORE_LIB },
      { name: "App.tsx", language: "typescript", content: BLOG_APP },
      { name: "styles.css", language: "css", content: STYLES },
    ],
  },
  {
    slug: "portfolio",
    name: "Portfolio",
    description: "Galería de proyectos con filtros por categoría.",
    category: "portfolio",
    sort_order: 70,
    files: [
      indexHtml("Portfolio"),
      { name: "main.tsx", language: "typescript", content: MAIN_TSX },
      { name: "lib/store.ts", language: "typescript", content: STORE_LIB },
      { name: "App.tsx", language: "typescript", content: PORTFOLIO_APP },
      { name: "styles.css", language: "css", content: STYLES },
    ],
  },
  // ===== Nuevas plantillas por vertical =====
  // Restaurantes (3)
  {
    slug: "restaurante-starter",
    name: "Restaurante · Starter",
    description: "Landing para restaurante con CTA y reserva por formulario.",
    category: "landing",
    sort_order: 80,
    files: [
      indexHtml("Restaurante"),
      { name: "main.tsx", language: "typescript", content: MAIN_TSX },
      { name: "lib/store.ts", language: "typescript", content: STORE_LIB },
      { name: "App.tsx", language: "typescript", content: LANDING_APP },
      { name: "styles.css", language: "css", content: STYLES },
    ],
  },
  {
    slug: "restaurante-menu-pedidos",
    name: "Restaurante · Menú y pedidos",
    description: "Catálogo de platos y flujo de pedido básico con carrito.",
    category: "ecommerce",
    sort_order: 90,
    files: [
      indexHtml("Menú restaurante"),
      { name: "main.tsx", language: "typescript", content: MAIN_TSX },
      { name: "lib/store.ts", language: "typescript", content: STORE_LIB },
      { name: "App.tsx", language: "typescript", content: SHOP_APP },
      { name: "styles.css", language: "css", content: STYLES },
    ],
  },
  {
    slug: "restaurante-premium",
    name: "Restaurante · Premium",
    description: "Home premium para marca gastronómica con secciones listas para iterar.",
    category: "landing",
    sort_order: 100,
    files: [
      indexHtml("Restaurante premium"),
      { name: "main.tsx", language: "typescript", content: MAIN_TSX },
      { name: "lib/store.ts", language: "typescript", content: STORE_LIB },
      { name: "App.tsx", language: "typescript", content: LANDING_APP },
      { name: "styles.css", language: "css", content: STYLES },
    ],
  },
  // Tiendas / negocios (3)
  {
    slug: "tienda-negocio-starter",
    name: "Tienda / negocio · Starter",
    description: "Landing comercial con propuesta de valor y contacto.",
    category: "landing",
    sort_order: 110,
    files: [
      indexHtml("Negocio starter"),
      { name: "main.tsx", language: "typescript", content: MAIN_TSX },
      { name: "lib/store.ts", language: "typescript", content: STORE_LIB },
      { name: "App.tsx", language: "typescript", content: LANDING_APP },
      { name: "styles.css", language: "css", content: STYLES },
    ],
  },
  {
    slug: "tienda-negocio-catalogo",
    name: "Tienda / negocio · Catálogo",
    description: "Catálogo con carrito y totales para ventas rápidas.",
    category: "ecommerce",
    sort_order: 120,
    files: [
      indexHtml("Tienda catálogo"),
      { name: "main.tsx", language: "typescript", content: MAIN_TSX },
      { name: "lib/store.ts", language: "typescript", content: STORE_LIB },
      { name: "App.tsx", language: "typescript", content: SHOP_APP },
      { name: "styles.css", language: "css", content: STYLES },
    ],
  },
  {
    slug: "tienda-negocio-pro",
    name: "Tienda / negocio · Pro",
    description: "Versión comercial lista para personalizar con branding.",
    category: "ecommerce",
    sort_order: 130,
    files: [
      indexHtml("Tienda pro"),
      { name: "main.tsx", language: "typescript", content: MAIN_TSX },
      { name: "lib/store.ts", language: "typescript", content: STORE_LIB },
      { name: "App.tsx", language: "typescript", content: SHOP_APP },
      { name: "styles.css", language: "css", content: STYLES },
    ],
  },
  // Hoteles (3)
  {
    slug: "hotel-starter",
    name: "Hotel · Starter",
    description: "Landing para hotel con CTA de reserva.",
    category: "landing",
    sort_order: 140,
    files: [
      indexHtml("Hotel starter"),
      { name: "main.tsx", language: "typescript", content: MAIN_TSX },
      { name: "lib/store.ts", language: "typescript", content: STORE_LIB },
      { name: "App.tsx", language: "typescript", content: LANDING_APP },
      { name: "styles.css", language: "css", content: STYLES },
    ],
  },
  {
    slug: "hotel-reservas",
    name: "Hotel · Reservas",
    description: "Plantilla hotelera orientada a captación y reservas.",
    category: "landing",
    sort_order: 150,
    files: [
      indexHtml("Hotel reservas"),
      { name: "main.tsx", language: "typescript", content: MAIN_TSX },
      { name: "lib/store.ts", language: "typescript", content: STORE_LIB },
      { name: "App.tsx", language: "typescript", content: LANDING_APP },
      { name: "styles.css", language: "css", content: STYLES },
    ],
  },
  {
    slug: "hotel-premium",
    name: "Hotel · Premium",
    description: "Plantilla premium para hoteles boutique o resorts.",
    category: "landing",
    sort_order: 160,
    files: [
      indexHtml("Hotel premium"),
      { name: "main.tsx", language: "typescript", content: MAIN_TSX },
      { name: "lib/store.ts", language: "typescript", content: STORE_LIB },
      { name: "App.tsx", language: "typescript", content: LANDING_APP },
      { name: "styles.css", language: "css", content: STYLES },
    ],
  },
  // Boutique (3)
  {
    slug: "boutique-starter",
    name: "Boutique · Starter",
    description: "Landing elegante para boutique de moda o diseño.",
    category: "landing",
    sort_order: 170,
    files: [
      indexHtml("Boutique starter"),
      { name: "main.tsx", language: "typescript", content: MAIN_TSX },
      { name: "lib/store.ts", language: "typescript", content: STORE_LIB },
      { name: "App.tsx", language: "typescript", content: LANDING_APP },
      { name: "styles.css", language: "css", content: STYLES },
    ],
  },
  {
    slug: "boutique-catalogo",
    name: "Boutique · Catálogo",
    description: "Catálogo de productos con carrito básico para boutique.",
    category: "ecommerce",
    sort_order: 180,
    files: [
      indexHtml("Boutique catálogo"),
      { name: "main.tsx", language: "typescript", content: MAIN_TSX },
      { name: "lib/store.ts", language: "typescript", content: STORE_LIB },
      { name: "App.tsx", language: "typescript", content: SHOP_APP },
      { name: "styles.css", language: "css", content: STYLES },
    ],
  },
  {
    slug: "boutique-premium",
    name: "Boutique · Premium",
    description: "Diseño premium listo para campañas y colecciones.",
    category: "landing",
    sort_order: 190,
    files: [
      indexHtml("Boutique premium"),
      { name: "main.tsx", language: "typescript", content: MAIN_TSX },
      { name: "lib/store.ts", language: "typescript", content: STORE_LIB },
      { name: "App.tsx", language: "typescript", content: LANDING_APP },
      { name: "styles.css", language: "css", content: STYLES },
    ],
  },
  // Básicas (3)
  {
    slug: "basica-landing",
    name: "Básica · Landing",
    description: "Landing base rápida para validar idea y publicar.",
    category: "starter",
    sort_order: 200,
    files: [
      indexHtml("Landing básica"),
      { name: "main.tsx", language: "typescript", content: MAIN_TSX },
      { name: "lib/store.ts", language: "typescript", content: STORE_LIB },
      { name: "App.tsx", language: "typescript", content: LANDING_APP },
      { name: "styles.css", language: "css", content: STYLES },
    ],
  },
  {
    slug: "basica-dashboard",
    name: "Básica · Dashboard",
    description: "Panel base con KPIs para proyectos internos.",
    category: "starter",
    sort_order: 210,
    files: [
      indexHtml("Dashboard básico"),
      { name: "main.tsx", language: "typescript", content: MAIN_TSX },
      { name: "lib/store.ts", language: "typescript", content: STORE_LIB },
      { name: "App.tsx", language: "typescript", content: DASHBOARD_APP },
      { name: "styles.css", language: "css", content: STYLES },
    ],
  },
  {
    slug: "basica-catalogo",
    name: "Básica · Catálogo",
    description: "Catálogo simple de productos/servicios para iniciar.",
    category: "starter",
    sort_order: 220,
    files: [
      indexHtml("Catálogo básico"),
      { name: "main.tsx", language: "typescript", content: MAIN_TSX },
      { name: "lib/store.ts", language: "typescript", content: STORE_LIB },
      { name: "App.tsx", language: "typescript", content: SHOP_APP },
      { name: "styles.css", language: "css", content: STYLES },
    ],
  },
];

/** Compatibilidad con CodeEditor / IDE. No mutar — usar `getFreshDefaultProjectFiles()`. */
export const initialFiles = GAFCORE_DEFAULT_TEMPLATE_FILES;

/** Snapshot al cargar el módulo: inmune a mutaciones del array `initialFiles` en runtime. */
const PRISTINE_GAFCORE_DEFAULT_TEMPLATE_FILES: GafcoreTemplateFile[] =
  GAFCORE_DEFAULT_TEMPLATE_FILES.map((f) => ({
    name: f.name,
    language: f.language,
    content: f.content,
  }));

/** Plantilla welcome limpia (siempre desde snapshot, nunca desde estado mutado). */
export function getFreshDefaultProjectFiles(): GafcoreTemplateFile[] {
  return PRISTINE_GAFCORE_DEFAULT_TEMPLATE_FILES.map((f) => ({
    name: f.name,
    language: f.language,
    content: f.content,
  }));
}

/** @deprecated Usar `getFreshDefaultProjectFiles`. */
export function cloneGafcoreDefaultTemplateFiles(): GafcoreTemplateFile[] {
  return getFreshDefaultProjectFiles();
}

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
  return out.length > 0 ? out : getFreshDefaultProjectFiles();
}
