-- E1+: más plantillas publicadas + primer plugin IA (before_chat).

DO $$
DECLARE
  v_pub uuid;
  v_listing uuid;
  v_version uuid;
  v_manifest jsonb;
BEGIN
  SELECT id INTO v_pub FROM public.gafcore_publishers WHERE slug = 'gafcore-labs';
  IF v_pub IS NULL THEN RETURN; END IF;

  -- Portfolio personal
  v_manifest := jsonb_build_object(
    'kind', 'template',
    'version', 1,
    'slug', 'portfolio-personal',
    'name', 'Portfolio personal',
    'description', 'Página de presentación con proyectos y contacto.',
    'category', 'landing',
    'files', jsonb_build_array(
      jsonb_build_object('name', 'src/App.tsx', 'language', 'tsx', 'content',
        'export default function App() {
  const projects = [
    { title: "Proyecto A", tag: "Web" },
    { title: "Proyecto B", tag: "App" },
  ];
  return (
    <main className="page">
      <header className="hero">
        <p className="eyebrow">Portfolio</p>
        <h1>Tu nombre</h1>
        <p className="lead">Diseño y desarrollo de productos digitales.</p>
      </header>
      <section className="grid">
        {projects.map((p) => (
          <article key={p.title} className="card">
            <h2>{p.title}</h2>
            <span>{p.tag}</span>
          </article>
        ))}
      </section>
      <footer className="contact">contacto@ejemplo.com</footer>
    </main>
  );
}'),
      jsonb_build_object('name', 'src/styles.css', 'language', 'css', 'content',
        'body { margin: 0; font-family: system-ui, sans-serif; background: oklch(0.97 0.01 280); color: oklch(0.22 0.02 280); }
.page { max-width: 56rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
.hero h1 { font-size: clamp(2rem, 4vw, 2.75rem); margin: 0.25rem 0; }
.lead { color: oklch(0.45 0.03 280); }
.grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); margin-top: 2rem; }
.card { padding: 1.25rem; border-radius: 0.75rem; background: oklch(1 0 0); border: 1px solid oklch(0.9 0.01 280); }
.contact { margin-top: 3rem; font-size: 0.9rem; color: oklch(0.5 0.03 280); }'),
      jsonb_build_object('name', 'src/main.tsx', 'language', 'tsx', 'content',
        'import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
createRoot(document.getElementById("root")!).render(<App />);')
    ),
    'requiredPaths', jsonb_build_array('src/App.tsx', 'src/styles.css')
  );

  INSERT INTO public.gafcore_marketplace_listings (
    publisher_id, slug, name, description, kind, state, version_label, sort_order
  )
  VALUES (
    v_pub, 'portfolio-personal', 'Portfolio personal',
    'Presenta tu trabajo con secciones de proyectos y contacto.', 'template', 'published', '1.0.0', 20
  )
  ON CONFLICT (slug) DO UPDATE SET state = 'published', name = EXCLUDED.name, description = EXCLUDED.description, updated_at = now()
  RETURNING id INTO v_listing;

  INSERT INTO public.gafcore_extension_versions (listing_id, version, manifest_json, content_hash)
  VALUES (v_listing, '1.0.0', v_manifest, 'seed-portfolio-v1')
  ON CONFLICT (listing_id, version) DO UPDATE SET manifest_json = EXCLUDED.manifest_json
  RETURNING id INTO v_version;

  UPDATE public.gafcore_marketplace_listings
  SET current_version_id = v_version, updated_at = now()
  WHERE id = v_listing;

  -- Tienda mini (ecommerce)
  v_manifest := jsonb_build_object(
    'kind', 'template',
    'version', 1,
    'slug', 'mini-store',
    'name', 'Tienda mini',
    'description', 'Catálogo simple con tarjetas de producto y CTA.',
    'category', 'ecommerce',
    'files', jsonb_build_array(
      jsonb_build_object('name', 'src/App.tsx', 'language', 'tsx', 'content',
        'export default function App() {
  const products = [
    { name: "Producto 1", price: "29 €" },
    { name: "Producto 2", price: "45 €" },
  ];
  return (
    <main className="shop">
      <header><h1>Mi tienda</h1><p>Envío en 48h</p></header>
      <div className="products">
        {products.map((p) => (
          <article key={p.name} className="product">
            <h2>{p.name}</h2>
            <p className="price">{p.price}</p>
            <button type="button">Añadir</button>
          </article>
        ))}
      </div>
    </main>
  );
}'),
      jsonb_build_object('name', 'src/styles.css', 'language', 'css', 'content',
        '.shop { font-family: system-ui, sans-serif; max-width: 48rem; margin: 0 auto; padding: 2rem 1rem; }
.products { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); }
.product { border: 1px solid oklch(0.88 0.01 250); border-radius: 0.5rem; padding: 1rem; background: oklch(0.99 0 0); }
.price { font-weight: 600; color: oklch(0.45 0.12 265); }
button { margin-top: 0.5rem; padding: 0.5rem 1rem; border: none; border-radius: 0.375rem; background: oklch(0.55 0.18 265); color: oklch(0.99 0 0); cursor: pointer; }'),
      jsonb_build_object('name', 'src/main.tsx', 'language', 'tsx', 'content',
        'import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
createRoot(document.getElementById("root")!).render(<App />);')
    ),
    'requiredPaths', jsonb_build_array('src/App.tsx', 'src/styles.css')
  );

  INSERT INTO public.gafcore_marketplace_listings (
    publisher_id, slug, name, description, kind, state, version_label, sort_order
  )
  VALUES (
    v_pub, 'mini-store', 'Tienda mini',
    'Catálogo de productos con precios y botón de compra.', 'template', 'published', '1.0.0', 30
  )
  ON CONFLICT (slug) DO UPDATE SET state = 'published', name = EXCLUDED.name, description = EXCLUDED.description, updated_at = now()
  RETURNING id INTO v_listing;

  INSERT INTO public.gafcore_extension_versions (listing_id, version, manifest_json, content_hash)
  VALUES (v_listing, '1.0.0', v_manifest, 'seed-mini-store-v1')
  ON CONFLICT (listing_id, version) DO UPDATE SET manifest_json = EXCLUDED.manifest_json
  RETURNING id INTO v_version;

  UPDATE public.gafcore_marketplace_listings
  SET current_version_id = v_version, updated_at = now()
  WHERE id = v_listing;

  -- Plugin IA: tono profesional
  v_manifest := jsonb_build_object(
    'kind', 'ai_plugin',
    'version', 1,
    'id', 'pro-spanish-tone',
    'name', 'Tono profesional (ES)',
    'description', 'La IA responde en español neutro, claro y orientado a cambios en archivos.',
    'hooks', jsonb_build_array('before_chat'),
    'systemPromptAppend',
    'Responde siempre en español neutro. Sé conciso y profesional. Prioriza editar archivos del proyecto (App.tsx, estilos) en lugar de solo explicar. Si el usuario pide una vista previa, asegúrate de que el código compile en el sandbox Vite.'
  );

  INSERT INTO public.gafcore_marketplace_listings (
    publisher_id, slug, name, description, kind, state, version_label, sort_order
  )
  VALUES (
    v_pub, 'pro-spanish-tone', 'Tono profesional (ES)',
    'Plugin de chat: respuestas en español profesional y enfoque en código.', 'ai_plugin', 'published', '1.0.0', 40
  )
  ON CONFLICT (slug) DO UPDATE SET state = 'published', name = EXCLUDED.name, description = EXCLUDED.description, updated_at = now()
  RETURNING id INTO v_listing;

  INSERT INTO public.gafcore_extension_versions (listing_id, version, manifest_json, content_hash)
  VALUES (v_listing, '1.0.0', v_manifest, 'seed-pro-spanish-v1')
  ON CONFLICT (listing_id, version) DO UPDATE SET manifest_json = EXCLUDED.manifest_json
  RETURNING id INTO v_version;

  UPDATE public.gafcore_marketplace_listings
  SET current_version_id = v_version, updated_at = now()
  WHERE id = v_listing;
END $$;
