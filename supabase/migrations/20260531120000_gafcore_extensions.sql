-- E1: Marketplace + extension installs (templates externos). No modifica tablas core existentes.

CREATE TABLE IF NOT EXISTS public.gafcore_publishers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gafcore_marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL REFERENCES public.gafcore_publishers(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  kind text NOT NULL CHECK (kind IN ('template', 'ai_plugin', 'agent', 'workflow_pack')),
  state text NOT NULL DEFAULT 'draft'
    CHECK (state IN ('draft', 'review', 'published', 'revoked')),
  current_version_id uuid,
  version_label text NOT NULL DEFAULT '1.0.0',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gafcore_extension_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.gafcore_marketplace_listings(id) ON DELETE CASCADE,
  version text NOT NULL DEFAULT '1.0.0',
  manifest_json jsonb NOT NULL,
  content_hash text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, version)
);

ALTER TABLE public.gafcore_marketplace_listings
  DROP CONSTRAINT IF EXISTS gafcore_marketplace_listings_current_version_id_fkey;

ALTER TABLE public.gafcore_marketplace_listings
  ADD CONSTRAINT gafcore_marketplace_listings_current_version_id_fkey
  FOREIGN KEY (current_version_id) REFERENCES public.gafcore_extension_versions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS gafcore_marketplace_listings_published_idx
  ON public.gafcore_marketplace_listings(kind, state, sort_order)
  WHERE state = 'published';

CREATE TABLE IF NOT EXISTS public.gafcore_extension_installs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  listing_id uuid NOT NULL REFERENCES public.gafcore_marketplace_listings(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES public.gafcore_extension_versions(id) ON DELETE RESTRICT,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  kind text NOT NULL,
  install_slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, listing_id)
);

CREATE INDEX IF NOT EXISTS gafcore_extension_installs_user_idx
  ON public.gafcore_extension_installs(user_id, kind);

ALTER TABLE public.gafcore_publishers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gafcore_marketplace_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gafcore_extension_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gafcore_extension_installs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read publishers" ON public.gafcore_publishers;
CREATE POLICY "read publishers"
  ON public.gafcore_publishers FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "read published listings" ON public.gafcore_marketplace_listings;
CREATE POLICY "read published listings"
  ON public.gafcore_marketplace_listings FOR SELECT TO authenticated
  USING (state = 'published');

DROP POLICY IF EXISTS "read versions of published listings" ON public.gafcore_extension_versions;
CREATE POLICY "read versions of published listings"
  ON public.gafcore_extension_versions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gafcore_marketplace_listings l
      WHERE l.id = listing_id AND l.state = 'published'
    )
  );

DROP POLICY IF EXISTS "users manage own installs" ON public.gafcore_extension_installs;
CREATE POLICY "users manage own installs"
  ON public.gafcore_extension_installs FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Seed: publisher + plantilla community de ejemplo
INSERT INTO public.gafcore_publishers (slug, display_name, verified)
VALUES ('gafcore-labs', 'GafCore Labs', true)
ON CONFLICT (slug) DO NOTHING;

DO $$
DECLARE
  v_pub uuid;
  v_listing uuid;
  v_version uuid;
  v_manifest jsonb;
BEGIN
  SELECT id INTO v_pub FROM public.gafcore_publishers WHERE slug = 'gafcore-labs';
  IF v_pub IS NULL THEN RETURN; END IF;

  v_manifest := jsonb_build_object(
    'kind', 'template',
    'version', 1,
    'slug', 'community-minimal-landing',
    'name', 'Landing mínima (community)',
    'description', 'Hero + CTA — plantilla de ejemplo del marketplace GafCore.',
    'category', 'landing',
    'files', jsonb_build_array(
      jsonb_build_object('name', 'src/App.tsx', 'language', 'tsx', 'content',
        'export default function App() { return (
  <main className="page">
    <section className="hero">
      <p className="eyebrow">GafCore Marketplace</p>
      <h1>Tu producto, en minutos</h1>
      <p className="lead">Plantilla externa instalada desde el ecosistema.</p>
      <button type="button" className="cta">Empezar</button>
    </section>
  </main>
); }'),
      jsonb_build_object('name', 'src/styles.css', 'language', 'css', 'content',
        ':root { color-scheme: light; }
body { margin: 0; font-family: system-ui, sans-serif; background: oklch(0.98 0.01 250); color: oklch(0.2 0.02 260); }
.page { min-height: 100vh; }
.hero { padding: 4rem 1.5rem; max-width: 48rem; margin: 0 auto; }
.eyebrow { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: oklch(0.5 0.05 260); }
h1 { font-size: clamp(2rem, 5vw, 3rem); margin: 0.5rem 0; }
.lead { font-size: 1.125rem; color: oklch(0.45 0.03 260); }
.cta { margin-top: 1.5rem; padding: 0.75rem 1.5rem; border: none; border-radius: 999px; background: oklch(0.55 0.18 265); color: oklch(0.99 0 0); font-weight: 600; cursor: pointer; }'),
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
    v_pub, 'community-minimal-landing', 'Landing mínima (community)',
    'Ejemplo de plantilla del marketplace.', 'template', 'published', '1.0.0', 10
  )
  ON CONFLICT (slug) DO UPDATE SET state = 'published', updated_at = now()
  RETURNING id INTO v_listing;

  INSERT INTO public.gafcore_extension_versions (listing_id, version, manifest_json, content_hash)
  VALUES (v_listing, '1.0.0', v_manifest, 'seed-community-minimal-v1')
  ON CONFLICT (listing_id, version) DO UPDATE SET manifest_json = EXCLUDED.manifest_json
  RETURNING id INTO v_version;

  UPDATE public.gafcore_marketplace_listings
  SET current_version_id = v_version, updated_at = now()
  WHERE id = v_listing;
END $$;
