
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Webhook idempotency
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,
  source text NOT NULL DEFAULT 'stripe',
  payload jsonb,
  processed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role manages webhook_events" ON public.webhook_events;
CREATE POLICY "service role manages webhook_events" ON public.webhook_events
  FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 2. OAuth state TTL
ALTER TABLE public.oauth_states
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes');
CREATE INDEX IF NOT EXISTS oauth_states_expires_at_idx ON public.oauth_states(expires_at);

CREATE OR REPLACE FUNCTION public.cleanup_expired_oauth_states()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  DELETE FROM public.oauth_states WHERE expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 3. Tighten projects RLS (require owner for new rows)
DROP POLICY IF EXISTS "Users can view own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can create own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can update own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can delete own projects" ON public.projects;

CREATE POLICY "view own projects" ON public.projects FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "create own projects" ON public.projects FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own projects" ON public.projects FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete own projects" ON public.projects FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(),'admin'::app_role));

-- 4. Encryption key holder (no policies = no client access)
CREATE TABLE IF NOT EXISTS public._app_keys (
  name text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public._app_keys ENABLE ROW LEVEL SECURITY;

INSERT INTO public._app_keys (name, value)
VALUES ('secrets_v1', encode(extensions.gen_random_bytes(32), 'base64'))
ON CONFLICT (name) DO NOTHING;

-- 5. project_secrets encryption
ALTER TABLE public.project_secrets
  ADD COLUMN IF NOT EXISTS value_encrypted bytea;

CREATE OR REPLACE FUNCTION public.encrypt_project_secret(_value text)
RETURNS bytea LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text;
BEGIN
  SELECT value INTO k FROM public._app_keys WHERE name='secrets_v1';
  RETURN pgp_sym_encrypt(_value, k);
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_project_secret(_secret_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE k text; v bytea; uid uuid;
BEGIN
  SELECT value INTO k FROM public._app_keys WHERE name='secrets_v1';
  SELECT value_encrypted, user_id INTO v, uid
    FROM public.project_secrets WHERE id=_secret_id;
  IF v IS NULL THEN RETURN NULL; END IF;
  IF uid <> auth.uid() AND NOT has_role(auth.uid(),'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN pgp_sym_decrypt(v, k);
END;
$$;

-- Migrate existing plaintext
UPDATE public.project_secrets
   SET value_encrypted = public.encrypt_project_secret(value)
 WHERE value_encrypted IS NULL AND value IS NOT NULL AND value <> '';

UPDATE public.project_secrets SET value = '' WHERE value_encrypted IS NOT NULL;

-- Auto-encrypt trigger
CREATE OR REPLACE FUNCTION public.tg_encrypt_project_secret()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.value IS NOT NULL AND NEW.value <> '' THEN
    NEW.value_encrypted := public.encrypt_project_secret(NEW.value);
    NEW.value := '';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS encrypt_project_secret_tg ON public.project_secrets;
CREATE TRIGGER encrypt_project_secret_tg
  BEFORE INSERT OR UPDATE ON public.project_secrets
  FOR EACH ROW EXECUTE FUNCTION public.tg_encrypt_project_secret();
