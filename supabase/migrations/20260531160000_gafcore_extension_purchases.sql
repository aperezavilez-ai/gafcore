-- E2: compras de extensiones marketplace (Stripe one-time payment)

CREATE TABLE IF NOT EXISTS public.gafcore_extension_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  listing_id uuid NOT NULL REFERENCES public.gafcore_marketplace_listings(id) ON DELETE CASCADE,
  stripe_session_id text UNIQUE,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'eur',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'refunded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gafcore_extension_purchases_user_listing_completed_idx
  ON public.gafcore_extension_purchases(user_id, listing_id)
  WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS gafcore_extension_purchases_user_idx
  ON public.gafcore_extension_purchases(user_id, status);

ALTER TABLE public.gafcore_extension_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own extension purchases" ON public.gafcore_extension_purchases;
CREATE POLICY "users read own extension purchases"
  ON public.gafcore_extension_purchases FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Demo: listing de pago (1,99 €) para probar checkout E2
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
    'slug', 'premium-landing-demo',
    'name', 'Landing premium (demo de pago)',
    'description', 'Plantilla de prueba E2 — requiere checkout Stripe antes de instalar.',
    'category', 'landing',
    'files', jsonb_build_array(
      jsonb_build_object('name', 'src/App.tsx', 'language', 'tsx', 'content',
        'export default function App() { return (
  <main className="page">
    <h1>Landing premium</h1>
    <p>Gracias por tu compra en el marketplace GafCore.</p>
  </main>
); }'),
      jsonb_build_object('name', 'src/styles.css', 'language', 'css', 'content',
        'body { margin: 0; font-family: system-ui, sans-serif; } .page { padding: 2rem; }')
    ),
    'requiredPaths', jsonb_build_array('src/App.tsx')
  );

  INSERT INTO public.gafcore_marketplace_listings (
    publisher_id, slug, name, description, kind, state, version_label, sort_order, price_cents, currency
  )
  VALUES (
    v_pub,
    'premium-landing-demo',
    'Landing premium (demo de pago)',
    'Plantilla de prueba E2 — requiere checkout Stripe antes de instalar.',
    'template',
    'published',
    '1.0.0',
    50,
    199,
    'eur'
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    price_cents = EXCLUDED.price_cents,
    currency = EXCLUDED.currency,
    state = 'published',
    updated_at = now()
  RETURNING id INTO v_listing;

  INSERT INTO public.gafcore_extension_versions (listing_id, version, manifest_json, content_hash)
  VALUES (v_listing, '1.0.0', v_manifest, 'seed-premium-demo')
  ON CONFLICT (listing_id, version) DO UPDATE SET manifest_json = EXCLUDED.manifest_json
  RETURNING id INTO v_version;

  UPDATE public.gafcore_marketplace_listings
  SET current_version_id = v_version, updated_at = now()
  WHERE id = v_listing;
END $$;

-- Listing en revision para probar flujo publisher → admin
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
    'kind', 'ai_plugin',
    'version', 1,
    'id', 'community-tone-review',
    'name', 'Tono community (revision)',
    'description', 'Plugin IA enviado a revision — prueba publisher.',
    'hooks', jsonb_build_array('before_chat'),
    'systemPromptAppend', 'Responde con tono cercano y breve en espanol.'
  );

  INSERT INTO public.gafcore_marketplace_listings (
    publisher_id, slug, name, description, kind, state, version_label, sort_order
  )
  VALUES (
    v_pub,
    'community-tone-review',
    'Tono community (revision)',
    'Plugin IA en estado review para probar publicacion admin.',
    'ai_plugin',
    'review',
    '1.0.0',
    60
  )
  ON CONFLICT (slug) DO UPDATE SET
    state = 'review',
    updated_at = now()
  RETURNING id INTO v_listing;

  INSERT INTO public.gafcore_extension_versions (listing_id, version, manifest_json, content_hash)
  VALUES (v_listing, '1.0.0', v_manifest, 'seed-review-demo')
  ON CONFLICT (listing_id, version) DO UPDATE SET manifest_json = EXCLUDED.manifest_json
  RETURNING id INTO v_version;

  UPDATE public.gafcore_marketplace_listings
  SET current_version_id = v_version, updated_at = now()
  WHERE id = v_listing;
END $$;
