-- =============================================================================
-- Ejecutar en Supabase → SQL Editor (rol de proyecto / postgres).
-- Otorga rol admin + límites de créditos "fair-use ilimitado" (consume_credits
-- no descuenta cuando monthly_allowance >= 1000).
--
-- 1) Cambia el correo si no es el tuyo.
-- 2) Run.
-- =============================================================================

BEGIN;

CREATE TEMP TABLE _bootstrap_admin_email (email text);
INSERT INTO _bootstrap_admin_email VALUES ('aperezavilez@gmail.com');

CREATE TEMP TABLE _bootstrap_uid AS
SELECT u.id AS user_id
FROM auth.users u
CROSS JOIN _bootstrap_admin_email e
WHERE lower(trim(u.email)) = lower(trim(e.email))
LIMIT 1;

DO $$
DECLARE
  uid uuid;
  em text;
BEGIN
  SELECT email INTO em FROM _bootstrap_admin_email LIMIT 1;
  SELECT user_id INTO uid FROM _bootstrap_uid;
  IF uid IS NULL THEN
    RAISE EXCEPTION 'No existe usuario en auth.users con el correo: %. Créalo en Authentication → Users antes.', em;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (uid, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.user_credits (user_id, balance, monthly_allowance, daily_limit)
  VALUES (uid, 1000, 1000, 1000)
  ON CONFLICT (user_id) DO UPDATE SET
    balance = greatest(public.user_credits.balance, 1000),
    monthly_allowance = 1000,
    daily_limit = 1000,
    updated_at = now();

  RAISE NOTICE 'Admin listo para user_id % (correo %)', uid, em;
END $$;

COMMIT;
