-- E2: publisher por usuario + precio en listings (pagos Stripe en fase siguiente)

ALTER TABLE public.gafcore_publishers
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS gafcore_publishers_owner_user_idx
  ON public.gafcore_publishers(owner_user_id)
  WHERE owner_user_id IS NOT NULL;

ALTER TABLE public.gafcore_marketplace_listings
  ADD COLUMN IF NOT EXISTS price_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'eur';

ALTER TABLE public.gafcore_marketplace_listings
  DROP CONSTRAINT IF EXISTS gafcore_marketplace_listings_price_nonneg;

ALTER TABLE public.gafcore_marketplace_listings
  ADD CONSTRAINT gafcore_marketplace_listings_price_nonneg
  CHECK (price_cents >= 0);
