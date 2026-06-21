/**
 * Reproducción determinista del falso positivo del gate de entrega.
 *
 * Caso: "Construye un catálogo de productos con grid, imágenes, precios y
 * filtros básicos". El App.tsx generado usa genéricos TS (useState<string>,
 * useState<number>) que el contador de tags por regex confundía con tags JSX
 * de apertura sin cierre → emitía error category:"syntax" y BLOQUEABA la
 * entrega, aunque Babel transpila el archivo sin problema.
 *
 * Tras el fix debe pasar (ok:true): Babel es ahora la autoridad de sintaxis.
 *
 * Ejecutar: npx tsx scripts/repro-catalog-gate.ts
 */
import { gateDeliveredFiles } from "@/lib/gafcore-chat-delivery-gate.shared";
import { validateGafcoreProjectCore } from "@/lib/gafcore-validate.server";
import { auditProjectLocally } from "@/lib/gafcore-ai-validation.shared";

const appTsx = `import React, { useState, useMemo } from "react";

type Product = {
  id: number;
  name: string;
  price: number;
  image: string;
  category: string;
};

const PRODUCTS: Product[] = [
  { id: 1, name: "Camiseta", price: 19.99, image: "https://picsum.photos/seed/1/300", category: "ropa" },
  { id: 2, name: "Taza", price: 9.5, image: "https://picsum.photos/seed/2/300", category: "hogar" },
  { id: 3, name: "Libreta", price: 4.25, image: "https://picsum.photos/seed/3/300", category: "oficina" },
];

export default function App() {
  // Genéricos TS: esto es lo que el contador de tags marcaba como JSX desbalanceado.
  const [query, setQuery] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<number>(100);
  const [category, setCategory] = useState<string>("todas");

  const filtered = useMemo<Product[]>(() => {
    return PRODUCTS.filter((p) => {
      const matchesQuery = p.name.toLowerCase().includes(query.toLowerCase());
      const matchesPrice = p.price <= maxPrice;
      const matchesCat = category === "todas" || p.category === category;
      return matchesQuery && matchesPrice && matchesCat;
    });
  }, [query, maxPrice, category]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Catálogo</h1>
      <div className="flex gap-3 mb-6">
        <input
          type="text"
          placeholder="Buscar producto"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="border px-3 py-2 rounded"
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="border px-3 py-2 rounded">
          <option value="todas">Todas</option>
          <option value="ropa">Ropa</option>
          <option value="hogar">Hogar</option>
          <option value="oficina">Oficina</option>
        </select>
        <input
          type="range"
          min={0}
          max={100}
          value={maxPrice}
          onChange={(e) => setMaxPrice(Number(e.target.value))}
        />
      </div>
      <div className="grid grid-cols-3 gap-4">
        {filtered.map((p) => (
          <article key={p.id} className="border rounded overflow-hidden">
            <img src={p.image} alt={p.name} className="w-full h-40 object-cover" />
            <div className="p-3">
              <h2 className="font-semibold">{p.name}</h2>
              <p className="text-sm text-gray-600">{p.price.toFixed(2)} €</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
`;

const mainTsx = `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(<App />);
`;

const indexHtml = `<!doctype html>
<html lang="es">
  <head><meta charset="utf-8" /><title>Catálogo</title></head>
  <body><div id="root"></div><script type="module" src="/main.tsx"></script></body>
</html>
`;

async function main() {
  const delta = [
    { name: "App.tsx", content: appTsx },
    { name: "main.tsx", content: mainTsx },
    { name: "index.html", content: indexHtml },
  ];

  console.log("=".repeat(72));
  console.log("REPRO: catalogo de productos con grid + filtros (genericos TS)");
  console.log("=".repeat(72));

  const heur = auditProjectLocally(delta);
  const heurSyntaxErrors = heur.issues.filter(
    (i) => i.category === "syntax" && i.severity === "error",
  );
  const heurSyntaxWarns = heur.issues.filter(
    (i) => i.category === "syntax" && i.severity === "warn",
  );
  console.log("\n[1] auditProjectLocally (heuristica regex)");
  console.log("    errores de sintaxis (bloqueantes):", heurSyntaxErrors.length);
  console.log("    avisos de sintaxis (post-fix, no bloquean):", heurSyntaxWarns.length);
  for (const w of heurSyntaxWarns) console.log("      - warn:", w.file, "->", w.message);

  const babel = await validateGafcoreProjectCore(delta);
  const babelSyntaxErrors = babel.issues.filter(
    (i) => i.category === "syntax" && i.severity === "error",
  );
  console.log("\n[2] validateGafcoreProjectCore (Babel real)");
  console.log("    ok:", babel.ok);
  console.log("    errores de sintaxis (severity=error):", babelSyntaxErrors.length);

  const gate = await gateDeliveredFiles([], delta, "catalogo de productos con grid y filtros");
  console.log("\n[3] gateDeliveredFiles (post-fix: Babel = autoridad de sintaxis)");
  console.log("    ok:", gate.ok);
  console.log("    archivos entregados:", gate.files.length);
  console.log("    issues bloqueantes:", gate.issues.filter((i) => i.severity === "error").length);
  if (!gate.ok) console.log("    userMessage:", gate.userMessage);

  console.log("\n" + "=".repeat(72));
  const pass = gate.ok && babel.ok;
  console.log(
    pass
      ? "PASS - el catalogo se entrega. Babel valida la sintaxis; la heuristica ya no bloquea."
      : "FAIL - el gate sigue bloqueando un catalogo valido.",
  );
  console.log("=".repeat(72));
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error("Error en repro:", e);
  process.exit(2);
});
