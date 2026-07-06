/**
 * Entrega fiable de builds del chat (cliente + servidor).
 * Garantiza que un pedido de construcción SIEMPRE produce archivos aplicables al preview.
 */
import { validateOutputFiles, type ProjFile } from "@/lib/gafcore-chat.shared";
import {
  patchProjectFilesVisually,
  repairGafcoreOutputFiles,
} from "@/lib/gafcore-media.shared";
import { ensureReactPackageJson } from "@/lib/gafcore-project-scaffold.shared";
import { isGafcoreDefaultTemplateApp } from "@/lib/gafcore-project-stale.shared";
import {
  aiReplyLooksLikePlanOnly,
  isSubstantiveBuildRequest,
} from "@/lib/gafcore-chat-intent.shared";
import {
  applyIncrementalEditPersistence,
  prepareIncrementalEditSession,
} from "@/lib/gafcore-incremental-edit.shared";
import { runIntegrityShield } from "@/lib/gafcore-integrity-shield.shared";
import { parseJsonLoose } from "@/lib/gafcore-json-loose.shared";
import { healWorkspaceSyntax } from "@/core/pipeline/syntax-heal.shared";

export type GafcoreDeliveredFile = {
  name: string;
  language?: string;
  content: string;
};

export type FinalizeBuildResult = {
  reply: string;
  files: GafcoreDeliveredFile[];
  /** Origen principal de los archivos entregados. */
  source: "ai" | "visual_patch" | "template_bootstrap" | "template_then_ai";
  /** true si la IA devolvió plan/texto sin código útil. */
  planOnly: boolean;
};

/** Plantillas desactivadas: siempre canvas en blanco + IA. */
export function filesFromBuiltinTemplateByInstruction(
  _instruction: string,
): GafcoreDeliveredFile[] {
  return [];
}

function fallbackTitle(instruction: string): string {
  if (/barber|barberia|barbería/i.test(instruction)) return "Barberia Premium";
  if (/restaurante|restaurant|comida/i.test(instruction)) return "Restaurante Premium";
  if (/salon|belleza|spa/i.test(instruction)) return "Estudio de Belleza";
  if (/tienda|shop|catalogo|catálogo/i.test(instruction)) return "Tienda Premium";
  return "Landing Premium";
}

function fallbackServices(instruction: string): string[] {
  if (/barber|barberia|barbería/i.test(instruction)) {
    return ["Corte clasico", "Barba premium", "Paquete completo"];
  }
  if (/restaurante|restaurant|comida/i.test(instruction)) {
    return ["Menu de autor", "Reservas privadas", "Catering"];
  }
  if (/salon|belleza|spa/i.test(instruction)) {
    return ["Estilo personal", "Tratamientos", "Agenda express"];
  }
  return ["Diseno profesional", "Conversion clara", "Contacto directo"];
}

function fallbackContextSource(contextFiles?: ProjFile[]): string {
  if (!contextFiles?.length) return "";
  return contextFiles
    .filter((file) => /\.(tsx|jsx|ts|js|html|css)$/i.test(file.name))
    .map((file) => `\n/* ${file.name} */\n${file.content}`)
    .join("\n")
    .slice(0, 60_000);
}

function isShoeCommerceInstruction(instruction: string, contextFiles?: ProjFile[]): boolean {
  const source = `${instruction}\n${fallbackContextSource(contextFiles)}`;
  return /\b(calzado|tenis|zapato|zapatos|zapatilla|zapatillas|sneaker|sneakers|shoe|shoes)\b/i.test(
    source,
  );
}

function createShoeCommerceFallbackFiles(): GafcoreDeliveredFile[] {
  const title = "SneakerLab Pro";
  const app = `import React, { useEffect, useMemo, useState } from "react";

const products = [
  {
    id: "urban-runner-pro",
    name: "Urban Runner Pro",
    category: "Running urbano",
    price: 1899,
    color: "Negro / lima",
    sizes: ["25", "26", "27", "28", "29"],
    rating: 4.9,
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "court-elite-low",
    name: "Court Elite Low",
    category: "Casual premium",
    price: 1599,
    color: "Blanco / azul",
    sizes: ["24", "25", "26", "27", "28"],
    rating: 4.8,
    image: "https://images.unsplash.com/photo-1460353581641-37baddab0fa2?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "trail-flex-knit",
    name: "Trail Flex Knit",
    category: "Outdoor ligero",
    price: 2199,
    color: "Arena / negro",
    sizes: ["26", "27", "28", "29", "30"],
    rating: 4.7,
    image: "https://images.unsplash.com/photo-1543508282-6319a3e2621f?auto=format&fit=crop&w=900&q=80",
  },
  {
    id: "street-classic-90",
    name: "Street Classic 90",
    category: "Lifestyle",
    price: 1399,
    color: "Rojo / blanco",
    sizes: ["24", "25", "26", "27", "28", "29"],
    rating: 4.8,
    image: "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?auto=format&fit=crop&w=900&q=80",
  },
];

const categories = ["Todos", "Running urbano", "Casual premium", "Outdoor ligero", "Lifestyle"];

export default function App() {
  const [category, setCategory] = useState("Todos");
  const [cart, setCart] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("sneakerlab-cart") || "{}");
    } catch {
      return {};
    }
  });
  const [selectedSize, setSelectedSize] = useState("27");
  const [leadEmail, setLeadEmail] = useState("");
  const [registered, setRegistered] = useState(false);

  useEffect(() => {
    localStorage.setItem("sneakerlab-cart", JSON.stringify(cart));
  }, [cart]);

  const visibleProducts = useMemo(
    () => products.filter((product) => category === "Todos" || product.category === category),
    [category],
  );

  const totalItems = useMemo(() => Object.values(cart).reduce((sum, qty) => sum + qty, 0), [cart]);
  const total = useMemo(
    () =>
      products.reduce((sum, product) => {
        return sum + product.price * (cart[product.id] || 0);
      }, 0),
    [cart],
  );

  const addToCart = (id) => {
    setCart((current) => ({ ...current, [id]: (current[id] || 0) + 1 }));
  };

  const clearCart = () => setCart({});

  const registerLead = (event) => {
    event.preventDefault();
    if (!leadEmail.trim()) return;
    setRegistered(true);
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-lime-300">Tienda de tenis</p>
            <h1 className="text-xl font-black">SneakerLab Pro</h1>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-bold text-zinc-300 md:flex">
            <a href="#catalogo" className="hover:text-white">Catalogo</a>
            <a href="#registro" className="hover:text-white">Registro VIP</a>
            <a href="#contacto" className="hover:text-white">Contacto</a>
          </nav>
          <div className="rounded-full border border-white/15 px-4 py-2 text-sm font-bold">
            Carrito: {totalItems} pares · \${total.toLocaleString("es-MX")} MXN
          </div>
        </div>
      </header>

      <section className="mx-auto grid min-h-[calc(100vh-76px)] max-w-7xl gap-10 px-5 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-lime-300">Nueva temporada 2026</p>
          <h2 className="mt-4 max-w-3xl text-5xl font-black leading-tight md:text-7xl">
            Tenis premium para correr, vender y conquistar la calle.
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-300">
            SneakerLab Pro combina colecciones urbanas, tallas reales, envio express y una compra rapida para clientes que buscan estilo sin complicaciones.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#catalogo" className="rounded-full bg-lime-300 px-6 py-3 font-black text-zinc-950 hover:bg-lime-200">
              Comprar tenis
            </a>
            <a href="#registro" className="rounded-full border border-white/15 px-6 py-3 font-bold hover:bg-white/10">
              Obtener cupon VIP
            </a>
          </div>
          <div className="mt-10 grid max-w-xl grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <strong className="text-2xl text-lime-300">24h</strong>
              <p className="mt-1 text-xs text-zinc-400">envio local</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <strong className="text-2xl text-lime-300">4.8</strong>
              <p className="mt-1 text-xs text-zinc-400">rating promedio</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <strong className="text-2xl text-lime-300">30d</strong>
              <p className="mt-1 text-xs text-zinc-400">devoluciones</p>
            </div>
          </div>
        </div>
        <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/5 shadow-2xl">
          <img
            src="https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1400&q=80"
            alt="Tenis rojos premium para tienda online"
            className="h-[28rem] w-full object-cover"
          />
        </div>
      </section>

      <section id="catalogo" className="border-y border-white/10 bg-white/[0.03] px-5 py-12">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.24em] text-lime-300">Catalogo</p>
              <h2 className="mt-2 text-3xl font-black md:text-5xl">Colecciones de tenis</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCategory(item)}
                  className={"rounded-full px-4 py-2 text-sm font-bold transition " + (category === item ? "bg-white text-zinc-950" : "border border-white/15 text-zinc-200 hover:bg-white/10")}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {visibleProducts.map((product) => (
              <article key={product.id} className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-xl">
                <img src={product.image} alt={product.name + " tenis " + product.color} className="h-56 w-full object-cover" />
                <div className="space-y-4 p-5">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-lime-300">{product.category}</p>
                    <h3 className="mt-2 text-xl font-black">{product.name}</h3>
                    <p className="mt-1 text-sm text-zinc-400">Color: {product.color} · Rating {product.rating}/5</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {product.sizes.map((size) => (
                      <button
                        key={product.id + size}
                        type="button"
                        onClick={() => setSelectedSize(size)}
                        className={"h-9 w-11 rounded-lg text-sm font-bold " + (selectedSize === size ? "bg-lime-300 text-zinc-950" : "bg-white/10 text-white hover:bg-white/20")}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-2xl font-black">\${product.price.toLocaleString("es-MX")} MXN</span>
                    <button
                      type="button"
                      onClick={() => addToCart(product.id)}
                      className="rounded-full bg-white px-4 py-2 text-sm font-black text-zinc-950 hover:bg-lime-200"
                    >
                      Agregar
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="garantia" className="mx-auto grid max-w-7xl gap-4 px-5 py-12 md:grid-cols-3">
        {["Envio express 24/48h", "Cambios y devoluciones 30 dias", "Reviews verificadas 4.8/5"].map((item) => (
          <div key={item} className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h3 className="text-xl font-black">{item}</h3>
            <p className="mt-3 text-sm leading-6 text-zinc-300">Confianza comercial visible para que el comprador se anime a finalizar la compra.</p>
          </div>
        ))}
      </section>

      <section id="registro" className="border-y border-white/10 bg-lime-300 px-5 py-14 text-zinc-950">
        <div className="mx-auto grid max-w-7xl gap-8 md:grid-cols-[1fr_0.9fr] md:items-center">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.24em]">Registro VIP</p>
            <h2 className="mt-3 text-4xl font-black md:text-6xl">Recibe drops, tallas nuevas y cupones antes que todos.</h2>
            <p className="mt-4 max-w-2xl text-lg font-semibold text-zinc-800">
              Frase de marca: pisa fuerte, compra rapido y estrena sin esperar.
            </p>
          </div>
          <form onSubmit={registerLead} className="rounded-2xl bg-zinc-950 p-5 text-white shadow-2xl">
            <label className="text-sm font-bold text-zinc-300" htmlFor="vip-email">Correo para promociones</label>
            <input
              id="vip-email"
              value={leadEmail}
              onChange={(event) => setLeadEmail(event.target.value)}
              placeholder="cliente@email.com"
              className="mt-3 w-full rounded-xl border border-white/10 bg-white px-4 py-3 text-zinc-950"
            />
            <button type="submit" className="mt-4 w-full rounded-xl bg-lime-300 px-5 py-3 font-black text-zinc-950 hover:bg-lime-200">
              Guardar registro
            </button>
            {registered ? <p className="mt-3 text-sm font-bold text-lime-300">Registro guardado. Tu cupon VIP esta activo.</p> : null}
          </form>
        </div>
      </section>

      <section id="contacto" className="mx-auto grid max-w-7xl gap-5 px-5 py-14 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 md:col-span-2">
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-lime-300">Datos del negocio</p>
          <h2 className="mt-3 text-3xl font-black">SneakerLab Pro Store</h2>
          <p className="mt-3 max-w-2xl leading-7 text-zinc-300">
            Showroom urbano con asesoria de talla, cambios sencillos y seleccion curada para running, lifestyle y streetwear.
          </p>
          <div className="mt-6 grid gap-3 text-sm text-zinc-300 md:grid-cols-2">
            <p><strong className="text-white">Direccion:</strong> Av. Central 248, Zona Centro</p>
            <p><strong className="text-white">Telefono:</strong> +52 614 123 4567</p>
            <p><strong className="text-white">Email:</strong> ventas@sneakerlab.mx</p>
            <p><strong className="text-white">Horario:</strong> Lun-Sab 10:00 a 20:00</p>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <p className="text-sm font-bold uppercase tracking-[0.24em] text-lime-300">Carrito activo</p>
          <p className="mt-4 text-4xl font-black">{totalItems}</p>
          <p className="mt-2 text-zinc-300">pares seleccionados</p>
          <p className="mt-4 text-xl font-black">\${total.toLocaleString("es-MX")} MXN</p>
        </div>
      </section>

      <footer className="border-t border-white/10 px-5 py-8 text-sm text-zinc-400">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="font-bold text-white">SneakerLab Pro</p>
          <p>Tenis premium, envio rapido y compras con confianza.</p>
        </div>
      </footer>

      {totalItems > 0 ? (
        <aside className="fixed bottom-4 left-1/2 z-30 w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 rounded-2xl border border-lime-300/40 bg-zinc-900 p-4 shadow-2xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="font-bold">{totalItems} producto(s) en carrito · Total \${total.toLocaleString("es-MX")} MXN · talla seleccionada {selectedSize}</p>
            <button type="button" onClick={clearCart} className="rounded-full border border-white/15 px-4 py-2 text-sm font-bold hover:bg-white/10">
              Vaciar carrito
            </button>
          </div>
        </aside>
      ) : null}
    </main>
  );
}
`;

  return [
    {
      name: "index.html",
      language: "html",
      content: `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>`,
    },
    {
      name: "main.tsx",
      language: "typescript",
      content:
        'import React from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App";\nimport "./styles.css";\n\ncreateRoot(document.getElementById("root")!).render(<App />);\n',
    },
    { name: "App.tsx", language: "typescript", content: app },
    {
      name: "styles.css",
      language: "css",
      content:
        ":root { color-scheme: dark; }\nhtml, body, #root { min-height: 100%; margin: 0; }\nbody { font-family: Inter, ui-sans-serif, system-ui, sans-serif; }\n* { box-sizing: border-box; }\n",
    },
  ];
}

function createSneakerZoneCommerceFallbackFiles(): GafcoreDeliveredFile[] {
  const title = "SneakerZone";
  const app = `import React, { useEffect, useMemo, useState } from "react";

const products = [
  { id: "air-runner-pro", brand: "Nike", name: "Air Runner Pro", category: "Running", price: 1299, oldPrice: 1599, discount: 19, rating: 4.8, image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80" },
  { id: "street-classic-77", brand: "Adidas", name: "Street Classic 77", category: "Street Style", price: 1099, oldPrice: 1399, discount: 21, rating: 4.7, image: "https://images.unsplash.com/photo-1460353581641-37baddab0fa2?auto=format&fit=crop&w=900&q=80" },
  { id: "urban-boost", brand: "Puma", name: "Urban Boost", category: "Lifestyle", price: 899, oldPrice: 1199, discount: 25, rating: 4.5, image: "https://images.unsplash.com/photo-1608231387042-66d1773070a5?auto=format&fit=crop&w=900&q=80" },
  { id: "court-vision-low", brand: "Nike", name: "Court Vision Low", category: "Basketball", price: 999, oldPrice: 1199, discount: 17, rating: 4.6, image: "https://images.unsplash.com/photo-1543508282-6319a3e2621f?auto=format&fit=crop&w=900&q=80" },
  { id: "retro-wave", brand: "New Balance", name: "Retro Wave", category: "Street Style", price: 1399, oldPrice: 1699, discount: 18, rating: 4.9, image: "https://images.unsplash.com/photo-1552346154-21d32810aba3?auto=format&fit=crop&w=900&q=80" },
  { id: "skate-high-og", brand: "Vans", name: "Skate High OG", category: "Skate", price: 799, oldPrice: 999, discount: 20, rating: 4.7, image: "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?auto=format&fit=crop&w=900&q=80" },
  { id: "cloud-stride", brand: "On Running", name: "Cloud Stride", category: "Running", price: 1599, oldPrice: 1899, discount: 16, rating: 4.8, image: "https://images.unsplash.com/photo-1603808033192-082d6919d3e1?auto=format&fit=crop&w=900&q=80" },
  { id: "air-max-pulse", brand: "Nike", name: "Air Max Pulse", category: "Lifestyle", price: 1499, oldPrice: 1799, discount: 17, rating: 4.9, image: "https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?auto=format&fit=crop&w=900&q=80" },
  { id: "zoomx-vapor", brand: "Nike", name: "ZoomX Vapor", category: "Running", price: 1799, oldPrice: 2199, discount: 18, rating: 4.8, image: "https://images.unsplash.com/photo-1605348532760-6753d2c43329?auto=format&fit=crop&w=900&q=80" },
  { id: "suede-classic-xxi", brand: "Puma", name: "Suede Classic XXI", category: "Street Style", price: 949, oldPrice: 1149, discount: 17, rating: 4.6, image: "https://images.unsplash.com/photo-1587563871167-1ee9c731aefb?auto=format&fit=crop&w=900&q=80" },
  { id: "superstar-bold", brand: "Adidas", name: "Superstar Bold", category: "Lifestyle", price: 1299, oldPrice: 1599, discount: 19, rating: 4.7, image: "https://images.unsplash.com/photo-1515955656352-a1fa3ffcd111?auto=format&fit=crop&w=900&q=80" },
  { id: "old-skool-pro", brand: "Vans", name: "Old Skool Pro", category: "Skate", price: 849, oldPrice: 1099, discount: 23, rating: 4.6, image: "https://images.unsplash.com/photo-1491553895911-0055eca6402d?auto=format&fit=crop&w=900&q=80" },
];

const collections = [
  { name: "Running", copy: "Tenis disenados para maximo rendimiento en cada zancada.", image: products[0].image },
  { name: "Street Style", copy: "Lo ultimo en tendencia urbana para el dia a dia.", image: products[1].image },
  { name: "Basketball", copy: "Agarre, soporte y estilo para la cancha.", image: products[3].image },
];

const benefits = [
  ["Envio Gratis", "En compras mayores a $999"],
  ["Devolucion Facil", "30 dias para cambios"],
  ["Pago Seguro", "Compra protegida"],
  ["Soporte 24/7", "Estamos para ti"],
];

const money = (value) => "$" + value.toLocaleString("es-MX");

export default function App() {
  const [category, setCategory] = useState("Todos");
  const [cart, setCart] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("sneakerzone-cart") || "{}");
    } catch {
      return {};
    }
  });
  const [email, setEmail] = useState("");
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    localStorage.setItem("sneakerzone-cart", JSON.stringify(cart));
  }, [cart]);

  const categories = useMemo(() => ["Todos", ...Array.from(new Set(products.map((product) => product.category)))], []);
  const visibleProducts = useMemo(
    () => products.filter((product) => category === "Todos" || product.category === category),
    [category],
  );
  const totalItems = useMemo(() => Object.values(cart).reduce((sum, qty) => sum + qty, 0), [cart]);
  const total = useMemo(
    () => products.reduce((sum, product) => sum + product.price * (cart[product.id] || 0), 0),
    [cart],
  );

  const addToCart = (id) => {
    setCart((current) => ({ ...current, [id]: (current[id] || 0) + 1 }));
  };

  const subscribe = (event) => {
    event.preventDefault();
    if (!email.trim()) return;
    setSubscribed(true);
  };

  return (
    <main className="min-h-screen bg-zinc-50 text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <a href="#inicio" className="text-lg font-black tracking-tight">
            Sneaker<span className="text-orange-600">Zone</span>
          </a>
          <nav className="hidden items-center gap-2 text-sm font-semibold text-slate-600 md:flex">
            {["Catalogo", "Ofertas", "Colecciones"].map((item) => (
              <a key={item} href={"#" + item.toLowerCase()} className="rounded-lg px-4 py-2 hover:bg-slate-100 hover:text-slate-950">
                {item}
              </a>
            ))}
          </nav>
          <a href="#carrito" className="relative rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black shadow-sm">
            Carrito
            <span className="ml-2 rounded-full bg-orange-600 px-2 py-0.5 text-xs text-white">{totalItems}</span>
          </a>
        </div>
      </header>

      <section id="inicio" className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white shadow-sm md:grid-cols-[0.95fr_1.05fr]">
          <div className="flex flex-col justify-center p-8 md:p-12">
            <span className="w-fit rounded-full bg-orange-100 px-3 py-1 text-xs font-black text-orange-700">Temporada 2026</span>
            <h1 className="mt-5 max-w-xl text-5xl font-black leading-[0.95] tracking-tight md:text-7xl">
              Encuentra tu par <span className="text-orange-600">perfecto</span>
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-slate-600">
              Tenis originales, ofertas reales y colecciones listas para correr, vestir y dominar la calle.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#ofertas" className="rounded-xl bg-orange-600 px-6 py-3 font-black text-white shadow-lg shadow-orange-600/20 hover:bg-orange-500">
                Ver ofertas
              </a>
              <a href="#catalogo" className="rounded-xl border border-slate-200 px-6 py-3 font-black hover:bg-slate-100">
                Catalogo
              </a>
            </div>
          </div>
          <div className="relative min-h-[28rem] overflow-hidden bg-gradient-to-br from-orange-50 via-white to-slate-100">
            <img
              src="https://images.unsplash.com/photo-1521093470119-a3acdc43374a?auto=format&fit=crop&w=1200&q=80"
              alt="Tenis urbanos premium"
              className="absolute left-1/2 top-1/2 h-[25rem] w-[18rem] -translate-x-1/2 -translate-y-1/2 rotate-[-8deg] rounded-xl object-cover shadow-2xl"
            />
          </div>
        </div>
      </section>

      <section id="ofertas" className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.18em] text-orange-600">Ofertas de la semana</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight">Sneakers con descuento</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={"rounded-lg px-4 py-2 text-sm font-black transition " + (category === item ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100")}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div id="catalogo" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {visibleProducts.map((product) => (
            <article key={product.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
              <div className="relative">
                <img src={product.image} alt={product.name + " tenis " + product.category} className="h-52 w-full object-cover" />
                <span className="absolute left-3 top-3 rounded-full bg-orange-600 px-2.5 py-1 text-xs font-black text-white">-{product.discount}%</span>
              </div>
              <div className="space-y-3 p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{product.brand}</p>
                <div>
                  <h3 className="text-lg font-black">{product.name}</h3>
                  <p className="mt-1 text-sm text-amber-500">Rating {product.rating}/5</p>
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-2xl font-black">{money(product.price)}</span>
                  <span className="text-sm text-slate-400 line-through">{money(product.oldPrice)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => addToCart(product.id)}
                  className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-black hover:border-orange-600 hover:text-orange-600"
                >
                  Agregar al carrito
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="colecciones" className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-3xl font-black tracking-tight">Colecciones</h2>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {collections.map((collection) => (
            <article key={collection.name} className="relative min-h-56 overflow-hidden rounded-xl bg-slate-900 p-6 text-white">
              <img src={collection.image} alt={collection.name + " tenis"} className="absolute inset-0 h-full w-full object-cover opacity-70" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent" />
              <div className="relative mt-24">
                <h3 className="text-2xl font-black">{collection.name}</h3>
                <p className="mt-2 text-sm text-white/85">{collection.copy}</p>
                <a href="#catalogo" className="mt-4 inline-flex rounded-lg bg-orange-600 px-4 py-2 text-sm font-black text-white">
                  Ver coleccion
                </a>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-8 sm:grid-cols-2 lg:grid-cols-4">
        {benefits.map(([title, copy]) => (
          <div key={title} className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-orange-100 text-orange-700">OK</div>
            <h3 className="font-black">{title}</h3>
            <p className="mt-1 text-sm text-slate-500">{copy}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <form onSubmit={subscribe} className="rounded-[1.25rem] border border-slate-200 bg-orange-50 p-8 text-center">
          <h2 className="text-3xl font-black">No encontraste lo que buscas?</h2>
          <p className="mt-2 text-slate-600">Suscribete para recibir ofertas exclusivas y nuevos lanzamientos.</p>
          <div className="mx-auto mt-5 flex max-w-md flex-col gap-3 sm:flex-row">
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="tu@email.com"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-4 py-3 outline-none focus:border-orange-500"
            />
            <button type="submit" className="rounded-lg bg-orange-600 px-5 py-3 font-black text-white hover:bg-orange-500">
              Suscribirme
            </button>
          </div>
          {subscribed ? <p className="mt-4 font-bold text-orange-700">Listo. Te enviaremos el proximo drop.</p> : null}
        </form>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <p className="text-lg font-black">Sneaker<span className="text-orange-600">Zone</span></p>
            <p className="mt-3 max-w-sm text-sm leading-6 text-slate-600">Tu tienda de tenis favorita. Estilo, comodidad y las mejores marcas en un solo lugar.</p>
          </div>
          <div>
            <h4 className="font-black">Enlaces</h4>
            <div className="mt-3 grid gap-2 text-sm text-slate-600">
              <a href="#inicio">Inicio</a>
              <a href="#catalogo">Catalogo</a>
              <a href="#ofertas">Ofertas</a>
              <a href="#colecciones">Colecciones</a>
            </div>
          </div>
          <div id="carrito">
            <h4 className="font-black">Carrito</h4>
            <p className="mt-3 text-sm text-slate-600">{totalItems} items</p>
            <p className="mt-1 text-xl font-black">Total: {money(total)}</p>
            <button type="button" onClick={() => setCart({})} className="mt-3 rounded-lg border border-slate-200 px-4 py-2 text-sm font-black hover:bg-slate-100">
              Vaciar carrito
            </button>
          </div>
        </div>
        <p className="border-t border-slate-200 py-5 text-center text-xs text-slate-500">2026 SneakerZone. Todos los derechos reservados.</p>
      </footer>
    </main>
  );
}
`;

  return [
    {
      name: "index.html",
      language: "html",
      content: `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>`,
    },
    {
      name: "main.tsx",
      language: "typescript",
      content:
        'import React from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App";\nimport "./styles.css";\n\ncreateRoot(document.getElementById("root")!).render(<App />);\n',
    },
    { name: "App.tsx", language: "typescript", content: app },
    {
      name: "styles.css",
      language: "css",
      content:
        ":root { color-scheme: light; }\nhtml, body, #root { min-height: 100%; margin: 0; }\nbody { font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #f8fafc; }\n* { box-sizing: border-box; }\n",
    },
  ];
}

export function createDeterministicBuildFallbackFiles(
  instruction: string,
  contextFiles: ProjFile[] = [],
): GafcoreDeliveredFile[] {
  if (isShoeCommerceInstruction(instruction, contextFiles)) {
    return createSneakerZoneCommerceFallbackFiles();
  }
  const title = fallbackTitle(instruction);
  const services = fallbackServices(instruction);
  const app = `import React, { useMemo, useState } from "react";

const services = ${JSON.stringify(services)};

export default function App() {
  const [selected, setSelected] = useState(services[0]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState(false);

  const summary = useMemo(() => selected + " reservado para " + (name || "tu cliente"), [selected, name]);

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    setSent(true);
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <section className="mx-auto grid min-h-screen max-w-6xl gap-10 px-6 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-amber-300">Agenda online</p>
          <h1 className="mt-4 text-5xl font-black leading-tight md:text-7xl">${title}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-neutral-300">
            Una experiencia web lista para captar clientes, mostrar servicios y recibir reservas desde el primer dia.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" onClick={() => scrollTo("reservar")} className="rounded-full bg-amber-400 px-6 py-3 font-bold text-neutral-950 hover:bg-amber-300">
              Reservar ahora
            </button>
            <button type="button" onClick={() => scrollTo("servicios")} className="rounded-full border border-white/20 px-6 py-3 font-semibold hover:bg-white/10">
              Ver servicios
            </button>
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur">
          <img
            src="https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=1200&q=80"
            alt="Servicio premium"
            className="h-80 w-full rounded-[1.5rem] object-cover"
          />
          <div className="mt-5 grid grid-cols-3 gap-3 text-center">
            <span className="rounded-2xl bg-neutral-950/70 px-3 py-4 text-sm">Citas</span>
            <span className="rounded-2xl bg-neutral-950/70 px-3 py-4 text-sm">Servicios</span>
            <span className="rounded-2xl bg-neutral-950/70 px-3 py-4 text-sm">Contacto</span>
          </div>
        </div>
      </section>

      <section id="servicios" className="border-y border-white/10 bg-neutral-900 px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-black">Servicios destacados</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {services.map((service) => (
              <button
                key={service}
                type="button"
                onClick={() => setSelected(service)}
                className={"rounded-3xl border p-6 text-left transition " + (selected === service ? "border-amber-300 bg-amber-300 text-neutral-950" : "border-white/10 bg-white/5 hover:bg-white/10")}
              >
                <span className="text-xl font-bold">{service}</span>
                <p className="mt-3 text-sm opacity-80">Atencion profesional, tiempos claros y seguimiento personalizado.</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section id="reservar" className="px-6 py-16">
        <form onSubmit={onSubmit} className="mx-auto grid max-w-4xl gap-4 rounded-[2rem] border border-white/10 bg-white/5 p-6 md:grid-cols-2">
          <div className="md:col-span-2">
            <h2 className="text-3xl font-black">Reserva tu cita</h2>
            <p className="mt-2 text-neutral-300">{summary}</p>
          </div>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre" className="rounded-2xl border border-white/10 bg-neutral-950 px-4 py-3" />
          <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="Telefono" className="rounded-2xl border border-white/10 bg-neutral-950 px-4 py-3" />
          <button type="submit" className="rounded-2xl bg-white px-5 py-3 font-bold text-neutral-950 md:col-span-2">
            Confirmar reserva
          </button>
          {sent ? <p className="text-emerald-300 md:col-span-2">Reserva recibida. Te contactaremos para confirmar horario.</p> : null}
        </form>
      </section>
    </main>
  );
}
`;

  return [
    {
      name: "index.html",
      language: "html",
      content: `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>`,
    },
    {
      name: "main.tsx",
      language: "typescript",
      content:
        'import React from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App";\nimport "./styles.css";\n\ncreateRoot(document.getElementById("root")!).render(<App />);\n',
    },
    { name: "App.tsx", language: "typescript", content: app },
    {
      name: "styles.css",
      language: "css",
      content:
        ":root { color-scheme: dark; }\nhtml, body, #root { min-height: 100%; margin: 0; }\nbody { font-family: Inter, ui-sans-serif, system-ui, sans-serif; }\n* { box-sizing: border-box; }\n",
    },
  ];
}

function contextStillWelcome(contextFiles: ProjFile[]): boolean {
  const app = contextFiles.find((f) => /^app\.(tsx|jsx)$/i.test(f.name));
  return !app || isGafcoreDefaultTemplateApp(app.content);
}

export function outputReplacesWelcome(
  contextFiles: ProjFile[],
  outputFiles: GafcoreDeliveredFile[],
): boolean {
  if (!contextStillWelcome(contextFiles)) return true;
  const outApp = outputFiles.find((f) => /^app\.(tsx|jsx)$/i.test(f.name));
  if (!outApp?.content?.trim()) return false;
  return !isGafcoreDefaultTemplateApp(outApp.content);
}

export function shouldBootstrapBuildDelivery(
  instruction: string,
  contextFiles: ProjFile[],
  outputFiles: GafcoreDeliveredFile[],
  reply: string,
): boolean {
  if (!isSubstantiveBuildRequest(instruction)) return false;
  if (outputFiles.length === 0) return true;
  if (aiReplyLooksLikePlanOnly(reply)) return true;
  if (contextStillWelcome(contextFiles) && !outputReplacesWelcome(contextFiles, outputFiles)) {
    return true;
  }
  return false;
}

/**
 * Si la IA metió el JSON entero en `reply` o dejó `files` vacío, extrae reply + files.
 */
export function unwrapGafcoreChatPayload(
  reply: string,
  files: unknown,
): { reply: string; files: unknown } {
  let outReply = typeof reply === "string" ? reply : "";
  let outFiles = files;

  const tryExtract = (text: string): boolean => {
    const trimmed = text.trim();
    if (!trimmed.startsWith("{") && !trimmed.includes('"files"')) return false;
    const parsed = parseJsonLoose<{ reply?: string; files?: unknown }>(trimmed);
    if (!parsed) return false;
    let changed = false;
    if (typeof parsed.reply === "string" && parsed.reply.trim()) {
      outReply = parsed.reply;
      changed = true;
    }
    if (Array.isArray(parsed.files) && validateOutputFiles(parsed.files).length > 0) {
      outFiles = parsed.files;
      changed = true;
    }
    return changed;
  };

  if (validateOutputFiles(outFiles).length === 0) {
    tryExtract(outReply);
  }
  if (outReply.trim().startsWith("{") && /"files"\s*:/.test(outReply)) {
    tryExtract(outReply);
  }

  return { reply: outReply, files: outFiles };
}

/** Repara, bootstrap plantilla y asegura package.json cuando hace falta. */
export function finalizeGafcoreBuildDelivery(
  instruction: string,
  contextFiles: ProjFile[],
  reply: string,
  rawFiles: unknown,
): FinalizeBuildResult {
  const unwrapped = unwrapGafcoreChatPayload(reply, rawFiles);
  const planOnly = aiReplyLooksLikePlanOnly(unwrapped.reply);
  let files = repairGafcoreOutputFiles(validateOutputFiles(unwrapped.files));
  let source: FinalizeBuildResult["source"] = "ai";
  let usedFallback = false;

  if (files.length === 0) {
    const patch = patchProjectFilesVisually(
      contextFiles.map((f) => ({
        name: f.name,
        language: f.language,
        content: f.content,
      })),
      instruction,
    );
    if (patch.length > 0) {
      files = repairGafcoreOutputFiles(patch);
      source = "visual_patch";
    }
  }

  if (shouldBootstrapBuildDelivery(instruction, contextFiles, files, unwrapped.reply)) {
    files = createDeterministicBuildFallbackFiles(instruction, contextFiles);
    source = "template_bootstrap";
    usedFallback = true;
    files = ensureReactPackageJson(files);
    /* Sin plantillas predefinidas — confiar en la respuesta de la IA o reintento del usuario. */
  } else if (files.length > 0) {
    files = ensureReactPackageJson(files);
  }

  const session = prepareIncrementalEditSession(contextFiles, instruction);
  if (!usedFallback && session.active && files.length > 0) {
    const persisted = applyIncrementalEditPersistence(contextFiles, files, session);
    const shield = runIntegrityShield(contextFiles, persisted.files, session.snapshot, {
      deltaPaths: files.map((f) => f.name),
      instruction,
    });
    files = shield.files;
  }

  if (!usedFallback) {
    const syntaxHeal = healWorkspaceSyntax(files);
    if (syntaxHeal.healed) {
      files = syntaxHeal.files;
    }
  }

  return { reply: unwrapped.reply, files, source, planOnly };
}

export const GAFCORE_CUSTOMIZE_AFTER_BOOTSTRAP_PREFIX =
  "[GAFCORE PERSONALIZAR] Ya tienes una base funcional (App.tsx, main.tsx, index.html). " +
  "Reescribe App.tsx y archivos necesarios para cumplir el pedido del usuario. " +
  "PROHIBIDO react-router (usa useState para vistas). " +
  "PROHIBIDO responder solo con plan: devuelve files con código completo. ";

export const GAFCORE_FORCE_FILES_BUILD_PREFIX =
  "[GAFCORE BUILD OBLIGATORIO] El usuario pidió CREAR o CONSTRUIR un proyecto. " +
  "Responde SOLO JSON { reply, files }. files NO puede estar vacío. " +
  "Incluye App.tsx (export default function App), main.tsx e index.html si faltan. " +
  "PROHIBIDO arquitectura en prosa, fases, módulos sin código, o plan sin implementar. " +
  "PROHIBIDO react-router. Iconos lucide: import obligatorio. " +
  "CHECKLIST DE SINTAXIS ANTES DE ENTREGAR: " +
  "(a) Cada { tiene su }, cada ( tiene su ), cada <Tag> tiene </Tag> o />. " +
  "(b) Todos los hooks/componentes usados están importados. " +
  "(c) No hay objetos renderizados directamente en JSX ({obj} → usa {obj.prop}). " +
  "(d) App.tsx tiene exactamente un export default function. ";
