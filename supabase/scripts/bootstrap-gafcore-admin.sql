-- =============================================================================
-- Supabase → SQL Editor (rol proyecto / postgres). Idempotente.
--
-- Objetivo: cuenta **aperezavilez@gmail.com** → rol `admin` + créditos ilimitados
-- (balance/cupo altos; `consume_credits` no descuenta si monthly_allowance >= 1000).
--
-- Plan gratis (resto de usuarios): **10 créditos** al registrarse (`handle_new_user`)
-- y la app ya muestra toast + modal de compra cuando se agotan (no cambiar eso aquí).
--
-- 1) Confirma que el usuario existe en Authentication con ese email exacto.
-- 2) Ejecuta el script completo. 3) Recarga /gafcore/app.
-- Para más admins, añade filas en el INSERT de _bootstrap_admin_email.
-- =============================================================================

BEGIN;

CREATE TEMP TABLE _bootstrap_admin_email (email text);
INSERT INTO _bootstrap_admin_email VALUES
  ('aperezavilez@gmail.com');

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT u.id AS user_id, u.email
    FROM auth.users u
    INNER JOIN _bootstrap_admin_email e ON lower(trim(u.email)) = lower(trim(e.email))
  LOOP
    INSERT INTO public.user_roles (user_id, role)
    VALUES (r.user_id, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    INSERT INTO public.user_credits (user_id, balance, monthly_allowance, daily_limit)
    VALUES (r.user_id, 1000, 1000, 1000)
    ON CONFLICT (user_id) DO UPDATE SET
      balance = greatest(public.user_credits.balance, 1000),
      monthly_allowance = 1000,
      daily_limit = 1000,
      updated_at = now();

    RAISE NOTICE 'Admin listo para user_id % (correo %)', r.user_id, r.email;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users u INNER JOIN _bootstrap_admin_email e ON lower(trim(u.email)) = lower(trim(e.email))
  ) THEN
    RAISE EXCEPTION 'Ningún correo de _bootstrap_admin_email coincide con auth.users. Revisa los INSERT y crea el usuario en Authentication antes.';
  END IF;
END $$;

COMMIT;
