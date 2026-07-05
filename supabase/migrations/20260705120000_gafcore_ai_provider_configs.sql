-- Configuracion administrable de proveedores IA para GafCore.
-- Las llaves se cifran con el mismo secrets_v1 usado por project_secrets.

CREATE TABLE IF NOT EXISTS public.gafcore_ai_provider_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('gptpro4all', 'anthropic', 'openai', 'openrouter', 'custom')),
  label text NOT NULL DEFAULT '',
  base_url text NOT NULL DEFAULT '',
  default_model text NOT NULL DEFAULT '',
  wire_api text NOT NULL DEFAULT 'chat_completions' CHECK (wire_api IN ('chat_completions', 'responses')),
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  api_key text NOT NULL DEFAULT '',
  api_key_encrypted bytea,
  api_key_hint text NOT NULL DEFAULT '',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gafcore_ai_provider_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role manages gafcore ai provider configs" ON public.gafcore_ai_provider_configs;
CREATE POLICY "service role manages gafcore ai provider configs"
  ON public.gafcore_ai_provider_configs
  FOR ALL TO public
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.tg_encrypt_gafcore_ai_provider_key()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.api_key IS NOT NULL AND NEW.api_key <> '' THEN
    NEW.api_key_encrypted := public.encrypt_project_secret(NEW.api_key);
    NEW.api_key_hint :=
      CASE
        WHEN length(NEW.api_key) <= 8 THEN repeat('*', length(NEW.api_key))
        ELSE left(NEW.api_key, 4) || repeat('*', greatest(length(NEW.api_key) - 8, 4)) || right(NEW.api_key, 4)
      END;
    NEW.api_key := '';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS encrypt_gafcore_ai_provider_key_tg ON public.gafcore_ai_provider_configs;
CREATE TRIGGER encrypt_gafcore_ai_provider_key_tg
  BEFORE INSERT OR UPDATE ON public.gafcore_ai_provider_configs
  FOR EACH ROW EXECUTE FUNCTION public.tg_encrypt_gafcore_ai_provider_key();

DROP TRIGGER IF EXISTS gafcore_ai_provider_configs_set_updated_at ON public.gafcore_ai_provider_configs;
CREATE TRIGGER gafcore_ai_provider_configs_set_updated_at
  BEFORE UPDATE ON public.gafcore_ai_provider_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS gafcore_ai_provider_configs_active_idx
  ON public.gafcore_ai_provider_configs (is_active, priority, provider);

CREATE OR REPLACE FUNCTION public.decrypt_gafcore_ai_provider_key(p_config_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k text;
  v bytea;
BEGIN
  SELECT value INTO k FROM public._app_keys WHERE name = 'secrets_v1';
  SELECT api_key_encrypted INTO v
    FROM public.gafcore_ai_provider_configs
    WHERE id = p_config_id AND is_active = true;
  IF v IS NULL OR k IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN pgp_sym_decrypt(v, k);
END;
$$;

REVOKE ALL ON FUNCTION public.decrypt_gafcore_ai_provider_key(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_gafcore_ai_provider_key(uuid) TO service_role;
