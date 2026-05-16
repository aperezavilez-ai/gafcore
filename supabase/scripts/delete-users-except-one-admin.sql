-- =============================================================================
-- SOLO EJECUTAR EN SUPABASE → SQL Editor (con cuenta dueña del proyecto).
-- Borra TODOS los usuarios de Auth salvo la cuenta indicada en KEEPER_EMAIL.
--
-- ANTES: haz backup / export si necesitas datos de prueba.
-- DESPUÉS: revisa Authentication → Users en el panel (solo debe quedar 1).
-- =============================================================================

BEGIN;

-- 1) Correo del administrador que debe permanecer (cámbialo si usas otro).
CREATE TEMP TABLE _params (keeper_email text);
INSERT INTO _params VALUES ('alfonsoavilery@icloud.com');

CREATE TEMP TABLE _keeper AS
SELECT u.id
FROM auth.users u
CROSS JOIN _params p
WHERE lower(trim(u.email)) = lower(trim(p.keeper_email))
LIMIT 1;

DO $$
DECLARE
  k uuid;
  em text;
  is_admin boolean;
BEGIN
  SELECT keeper_email INTO em FROM _params LIMIT 1;
  SELECT id INTO k FROM _keeper;
  IF k IS NULL THEN
    RAISE EXCEPTION 'No existe usuario en auth.users con el correo: %. Revísalo en Authentication → Users.', em;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = k AND ur.role = 'admin'
  ) INTO is_admin;
  IF NOT is_admin THEN
    RAISE WARNING 'El usuario % no tiene fila en user_roles con role = admin. El script sigue y conserva su cuenta; añade el rol admin en Supabase si lo necesitas.', em;
  END IF;
  RAISE NOTICE 'Se conserva únicamente el usuario: % (id %)', em, k;
END $$;

-- 2) Vista previa (opcional: descomenta para revisar correos que se borrarán).
-- SELECT id, email, created_at FROM auth.users WHERE id <> (SELECT id FROM _keeper);

-- 3) Datos públicos que referencian user_id (orden seguro: hijos antes que padres donde aplique).
-- Si alguna tabla no existe en tu proyecto, comenta esa línea o ejecuta por bloques.

DELETE FROM public.credit_transactions WHERE user_id <> (SELECT id FROM _keeper);
DELETE FROM public.user_credits WHERE user_id <> (SELECT id FROM _keeper);
DELETE FROM public.subscriptions WHERE user_id <> (SELECT id FROM _keeper);
DELETE FROM public.notifications WHERE user_id <> (SELECT id FROM _keeper);

DELETE FROM public.project_files
WHERE project_id IN (
  SELECT p.id FROM public.projects p WHERE p.user_id <> (SELECT id FROM _keeper)
);
DELETE FROM public.projects WHERE user_id <> (SELECT id FROM _keeper);

DELETE FROM public.generations WHERE user_id <> (SELECT id FROM _keeper);

DELETE FROM public.user_roles WHERE user_id <> (SELECT id FROM _keeper);

DELETE FROM public.profiles WHERE user_id <> (SELECT id FROM _keeper);

-- 4) Sesiones e identidades en Auth (orden habitual antes de borrar auth.users).
DELETE FROM auth.refresh_tokens
WHERE session_id IN (SELECT id FROM auth.sessions WHERE user_id <> (SELECT id FROM _keeper));
DELETE FROM auth.sessions WHERE user_id <> (SELECT id FROM _keeper);
DELETE FROM auth.identities WHERE user_id <> (SELECT id FROM _keeper);

-- 5) Usuarios en Auth.
DELETE FROM auth.users WHERE id <> (SELECT id FROM _keeper);

COMMIT;

-- Comprueba en: Authentication → Users (debe haber 1 fila).
